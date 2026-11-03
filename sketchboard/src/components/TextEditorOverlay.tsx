import { Fragment, useEffect, useRef, useState, type ReactNode } from "react";
import { ExternalLink, Link2, Trash2 } from "lucide-react";
import { refit, useStore } from "../store";
import type { SketchElement, TextLink, Viewport } from "../types";
import { DARK_FILTER, LINE_HEIGHT, LINK_COLOR, containerTextWidth, fontStack, isTextContainer, measureText, textLayout } from "../utils/renderer";
import { sceneToScreen } from "../utils/viewport";
import { linkAtOffset, setLinkRange, shiftLinks } from "../utils/textLinks";
import { sanitizeLink } from "../utils/embed";
import { openLink } from "../actions";
import { linkTitle, startLinkPick } from "../linkNav";
import { isInternalLink } from "../utils/internalLinks";
import LinkField from "./LinkField";

interface LinkDraft {
  start: number;
  end: number;
  url: string;
  existing: boolean;
}

function mirrorContent(text: string, links: TextLink[] | undefined): ReactNode {
  const parts: ReactNode[] = [];
  let pos = 0;
  for (const l of [...(links ?? [])].sort((a, b) => a.start - b.start)) {
    if (l.start > pos) parts.push(text.slice(pos, l.start));
    parts.push(
      <span key={l.start} className="tl-link" style={{ color: LINK_COLOR }}>
        {text.slice(l.start, l.end)}
      </span>,
    );
    pos = Math.max(pos, l.end);
  }
  parts.push(text.slice(pos));
  // a trailing newline needs something after it or the mirror drops the last line
  parts.push("​");
  return parts.map((p, i) => <Fragment key={i}>{p}</Fragment>);
}

function wordAt(text: string, pos: number): [number, number] | null {
  let a = pos;
  let b = pos;
  while (a > 0 && /\S/.test(text[a - 1])) a--;
  while (b < text.length && /\S/.test(text[b])) b++;
  return b > a ? [a, b] : null;
}

export default function TextEditorOverlay({
  element,
  viewport,
  theme,
  onFinish,
}: {
  element: SketchElement;
  viewport: Viewport;
  theme: "light" | "dark";
  onFinish: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const uiRef = useRef<HTMLDivElement>(null);
  const [selection, setSelection] = useState<[number, number]>([0, 0]);
  const [draft, setDraft] = useState<LinkDraft | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    // Focusing in the same tick as the creating click races that click's own
    // mouseup; deferring avoids it. rAF alone stalls in background tabs, so a
    // timer backs it up.
    const focus = () => {
      const el = ref.current;
      if (!el || document.activeElement === el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    };
    const raf = requestAnimationFrame(focus);
    const t = setTimeout(focus, 60);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(t);
    };
  }, [element.id]);

  const zoom = viewport.zoom;
  const fontSize = (element.fontSize ?? 20) * zoom;
  const container = isTextContainer(element);
  const lineH = fontSize * LINE_HEIGHT;
  const text = element.text ?? "";

  let left: number, top: number, width: number, height: number;
  if (container) {
    const layout = textLayout({ ...element, text: text || " " })!;
    const innerW = containerTextWidth(element);
    const textH = Math.max(layout.lineHeight, layout.lines.length * layout.lineHeight);
    const p = sceneToScreen({ x: element.x + layout.boxX, y: element.y + layout.startY }, viewport);
    left = p.x;
    top = p.y;
    width = innerW * zoom;
    height = textH * zoom;
  } else {
    const p = sceneToScreen({ x: element.x, y: element.y }, viewport);
    left = p.x;
    top = p.y;
    width = Math.max(fontSize, element.width * zoom) + fontSize;
    height = Math.max(lineH, element.height * zoom);
  }

  // rotate around the element's own center, expressed relative to this box
  const center = sceneToScreen({ x: element.x + element.width / 2, y: element.y + element.height / 2 }, viewport);
  const origin = `${center.x - left}px ${center.y - top}px`;

  const textStyle = {
    fontSize: `${fontSize}px`,
    fontFamily: fontStack(element.fontFamily),
    fontWeight: element.fontWeight === "bold" ? 700 : 400,
    fontStyle: element.fontStyle === "italic" ? "italic" : "normal",
    textDecoration: element.textDecoration && element.textDecoration !== "none" ? element.textDecoration : element.link ? "underline" : "none",
    textAlign: element.textAlign ?? (container ? "center" : "left"),
    lineHeight: LINE_HEIGHT,
    whiteSpace: container ? ("pre-wrap" as const) : ("pre" as const),
    overflowWrap: container ? ("break-word" as const) : ("normal" as const),
  };
  const color = container ? element.textColor ?? element.strokeColor : element.strokeColor;

  const update = (next: string, links = shiftLinks(element.textLinks, text, next)) => {
    if (container) {
      useStore.getState().updateElement(element.id, refit({ ...element, text: next, textLinks: links }));
    } else {
      const m = measureText(next || " ", element);
      useStore.getState().updateElement(element.id, { text: next, textLinks: links, width: m.width, height: m.height });
    }
  };

  const readSelection = () => {
    const ta = ref.current;
    if (ta) setSelection([ta.selectionStart, ta.selectionEnd]);
  };

  const openDraft = () => {
    const ta = ref.current;
    if (!ta) return;
    let [a, b] = [ta.selectionStart, ta.selectionEnd];
    const existing = linkAtOffset(element.textLinks, a, b);
    if (existing && (a === b || (a >= existing.start && b <= existing.end))) {
      [a, b] = [existing.start, existing.end];
    } else if (a === b) {
      const w = wordAt(text, a);
      if (!w) return;
      [a, b] = w;
    }
    ta.setSelectionRange(a, b);
    setSelection([a, b]);
    setError("");
    setDraft({ start: a, end: b, url: existing?.url ?? "", existing: !!existing });
  };

  const closeDraft = (refocus = true) => {
    setDraft(null);
    if (refocus) {
      requestAnimationFrame(() => {
        const ta = ref.current;
        if (!ta) return;
        ta.focus();
        ta.setSelectionRange(selection[1], selection[1]);
      });
    }
  };

  const saveDraft = (input: string) => {
    if (!draft) return;
    if (!input.trim()) {
      update(text, setLinkRange(element.textLinks, draft.start, draft.end, null));
      closeDraft();
      return;
    }
    const url = sanitizeLink(input);
    if (!url) {
      setError("Links must be web, mailto: or tel: addresses, or a place in this drawing");
      return;
    }
    update(text, setLinkRange(element.textLinks, draft.start, draft.end, url));
    closeDraft();
  };

  const [selStart, selEnd] = selection;
  const caretLink = linkAtOffset(element.textLinks, selStart, selEnd);
  const showPill = !draft && (selStart !== selEnd || !!caretLink);
  const uiTop = Math.max(8, top - 44);

  const leavingTo = (target: EventTarget | null) => !!target && (uiRef.current?.contains(target as Node) || target === ref.current);

  return (
    <>
      <div
        className="text-edit-box"
        style={{
          left,
          top,
          width,
          height,
          transform: element.angle ? `rotate(${element.angle}rad)` : undefined,
          transformOrigin: origin,
          filter: theme === "dark" ? DARK_FILTER : undefined,
          opacity: element.opacity / 100,
        }}
      >
        <div className="text-edit-mirror" aria-hidden style={{ ...textStyle, color }}>
          {mirrorContent(text, element.textLinks)}
        </div>
        <textarea
          ref={ref}
          className="text-edit-overlay"
          value={text}
          spellCheck={false}
          style={{ ...textStyle, caretColor: color }}
          onChange={(e) => update(e.target.value)}
          onSelect={readSelection}
          onKeyUp={readSelection}
          onMouseUp={readSelection}
          onKeyDown={(e) => {
            e.stopPropagation();
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
              e.preventDefault();
              openDraft();
            } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
              e.preventDefault();
              ref.current?.blur();
            } else if (e.key === "Escape") {
              e.preventDefault();
              ref.current?.blur();
            } else if (e.key === "Tab") {
              e.preventDefault();
              const ta = e.currentTarget;
              const { selectionStart: s, selectionEnd: end } = ta;
              update(text.slice(0, s) + "    " + text.slice(end));
              requestAnimationFrame(() => ta.setSelectionRange(s + 4, s + 4));
            }
          }}
          onBlur={(e) => {
            if (!leavingTo(e.relatedTarget)) onFinish();
          }}
        />
      </div>

      <div ref={uiRef} className="text-link-ui" style={{ left: Math.max(8, left), top: uiTop }}>
        {showPill && (
          <button
            className="text-link-pill"
            // keep the textarea focused (and its selection intact) while clicking
            onPointerDown={(e) => e.preventDefault()}
            onClick={openDraft}
            title="Link the selected text (Ctrl+K)"
          >
            <Link2 size={13} />
            {caretLink && selStart === selEnd ? <span className="pill-url">{linkTitle(caretLink.url)}</span> : <span>Add link</span>}
            <kbd>Ctrl+K</kbd>
          </button>
        )}
        {draft && (
          <div className="text-link-editor">
            <LinkField
              initial={draft.url}
              placeholder={`Link for "${text.slice(draft.start, draft.end).slice(0, 30)}" — web address or a place in this drawing`}
              onSubmit={saveDraft}
              onCancel={closeDraft}
              onEdit={() => setError("")}
              onPick={() => {
                const range: [number, number] = [draft.start, draft.end];
                setDraft(null);
                onFinish();
                startLinkPick(element.id, range);
              }}
              onBlur={(e) => {
                if (leavingTo(e.relatedTarget)) return;
                setDraft(null);
                onFinish();
              }}
              leading={<Link2 size={15} />}
              trailing={
                draft.existing && (
                  <>
                    <button title={isInternalLink(draft.url) ? "Go there" : "Open link"} onPointerDown={(e) => e.preventDefault()} onClick={() => openLink(draft.url)}>
                      <ExternalLink size={14} />
                    </button>
                    <button
                      title="Remove link"
                      onPointerDown={(e) => e.preventDefault()}
                      onClick={() => {
                        update(text, setLinkRange(element.textLinks, draft.start, draft.end, null));
                        closeDraft();
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )
              }
            />
            {error && <div className="link-error">{error}</div>}
          </div>
        )}
      </div>
    </>
  );
}

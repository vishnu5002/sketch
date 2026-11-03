import { useEffect, useRef, useState } from "react";
import { ExternalLink, Link2, Trash2, Globe } from "lucide-react";
import { useStore } from "../store";
import type { SketchElement } from "../types";
import { getRotatedBounds } from "../utils/geometry";
import { sceneToScreen } from "../utils/viewport";
import { getKnownEmbed, sanitizeEmbedUrl, sanitizeLink } from "../utils/embed";
import { isInternalLink } from "../utils/internalLinks";
import { openLink } from "../actions";
import { startLinkPick } from "../linkNav";
import LinkField from "./LinkField";

function Editor({ el, mode, isNew }: { el: SketchElement; mode: "link" | "embed"; isNew?: boolean }) {
  const viewport = useStore((s) => s.viewport);
  const [value, setValue] = useState(el.link ?? "");
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const st = useStore.getState;

  useEffect(() => {
    if (mode !== "embed") return;
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => cancelAnimationFrame(raf);
  }, [mode]);

  const close = () => st().setUI({ linkEditor: null });

  const cancel = () => {
    close();
    if (mode === "embed" && isNew && !el.link) st().undo();
  };

  const save = (input = value) => {
    const raw = input.trim();
    if (!raw) {
      if (mode === "link" && el.link) st().setLink(el.id, null);
      cancel();
      return;
    }
    const url = mode === "embed" ? sanitizeEmbedUrl(raw) : sanitizeLink(raw);
    if (!url) {
      setError(mode === "embed" ? "Enter an http(s) web address" : "Links must be web, mailto: or tel: addresses, or a place in this drawing");
      return;
    }
    st().setLink(el.id, url);
    if (mode === "embed") {
      const aspect = getKnownEmbed(url)?.aspect;
      if (aspect && isNew) st().updateElement(el.id, { height: el.width / aspect });
    }
    close();
  };

  const b = getRotatedBounds(el);
  const top = sceneToScreen({ x: b.x1, y: b.y1 }, viewport);
  const bottom = sceneToScreen({ x: b.x1, y: b.y2 }, viewport);
  const y = top.y - 64 > 60 ? top.y - 64 : bottom.y + 14;
  const x = Math.max(12, Math.min(top.x, window.innerWidth - 392));

  const openButton = el.link && (
    <button title={mode === "link" && isInternalLink(el.link) ? "Go there" : "Open in new tab"} onClick={() => openLink(el.link)}>
      <ExternalLink size={15} />
    </button>
  );

  return (
    <div className="link-editor" style={{ left: x, top: y }} onPointerDown={(e) => e.stopPropagation()}>
      {mode === "link" ? (
        <LinkField
          initial={el.link ?? ""}
          placeholder="Paste a web address, or type to find a page or element"
          onSubmit={save}
          onCancel={cancel}
          onPick={() => startLinkPick(el.id)}
          onEdit={() => setError("")}
          leading={<Link2 size={16} />}
          trailing={
            el.link && (
              <>
                {openButton}
                <button
                  title="Remove link"
                  onClick={() => {
                    st().setLink(el.id, null);
                    close();
                  }}
                >
                  <Trash2 size={15} />
                </button>
              </>
            )
          }
        />
      ) : (
        <div className="link-editor-row">
          <Globe size={16} />
          <input
            ref={inputRef}
            value={value}
            placeholder="Paste a YouTube, Figma, Loom, CodePen… or any https:// URL"
            onChange={(e) => {
              setValue(e.target.value);
              setError("");
            }}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") save();
              if (e.key === "Escape") cancel();
            }}
          />
          {openButton}
          <button className="primary" onClick={() => save()}>
            Save
          </button>
        </div>
      )}
      {error && <div className="link-error">{error}</div>}
      {mode === "embed" && !error && <div className="link-hint">Some sites block being embedded — they'll show an error inside the frame.</div>}
    </div>
  );
}

export default function LinkEditor() {
  const state = useStore((s) => s.linkEditor);
  const el = useStore((s) => (state ? s.elements.find((e) => e.id === state.elementId) : undefined));
  if (!state || !el) return null;
  return <Editor key={state.elementId + state.mode} el={el} mode={state.mode} isNew={state.isNew} />;
}

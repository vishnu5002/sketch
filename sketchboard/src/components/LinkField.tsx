import { useMemo, useState, type FocusEvent, type ReactNode } from "react";
import { Crosshair, FileText, Frame, LayoutDashboard, Type, X } from "lucide-react";
import { livePages, useStore } from "../store";
import { drawingLink, isInternalLink, linkSuggestions, localizeLink, otherDrawingOf, resolveInternalLink, type LinkSuggestion } from "../utils/internalLinks";
import { drawingName, knownDrawings } from "../linkNav";

/** Text that's clearly meant as a web address, so Enter shouldn't pick a suggestion instead. */
const looksLikeAddress = (t: string) => /^[a-z][\w+.-]*:/i.test(t) || /^www\./i.test(t) || /^\S+\.[a-z]{2,}(\/\S*)?$/i.test(t);

const KIND_ICON = { page: FileText, frame: Frame, text: Type, drawing: LayoutDashboard };

type Suggestion = LinkSuggestion | { link: string; kind: "drawing"; label: string; pageName: string };

/**
 * One input for both kinds of link: type or paste a web address, or type to
 * search this drawing's pages, frames and text and pick a place to jump to.
 * `onSubmit` gets the raw text (a web address to validate) or an internal link.
 */
export default function LinkField({
  initial,
  placeholder,
  onSubmit,
  onCancel,
  onPick,
  onBlur,
  onEdit,
  leading,
  trailing,
}: {
  initial: string;
  placeholder: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
  /** Start choosing the target by clicking on the canvas. */
  onPick?: () => void;
  onBlur?: (e: FocusEvent<HTMLInputElement>) => void;
  onEdit?: () => void;
  /** Shown before the input / between it and Save (icons, open & remove buttons). */
  leading?: ReactNode;
  trailing?: ReactNode;
}) {
  const projectId = useStore((s) => s.project?.id);
  const [text, setText] = useState(isInternalLink(initial) ? "" : initial);
  const [target, setTarget] = useState<string | null>(isInternalLink(initial) ? initial : null);
  const [active, setActive] = useState(-1);

  const pages = useMemo(() => livePages(), []);
  const otherDrawing = otherDrawingOf(target);
  const resolved = target && !otherDrawing ? resolveInternalLink(target, pages) : null;
  const chipLabel = otherDrawing ? `${drawingName(otherDrawing) ?? "Another drawing"}` : resolved?.label;
  const searching = !target && !looksLikeAddress(text.trim());
  const suggestions = useMemo<Suggestion[]>(() => {
    if (!searching) return [];
    const q = text.trim().toLowerCase();
    // other drawings come last, and only once something is typed
    const drawings = q
      ? knownDrawings()
          .filter((d) => d.name.toLowerCase().includes(q))
          .map((d) => ({ link: drawingLink(d.id), kind: "drawing" as const, label: d.name, pageName: "Other drawing" }))
      : [];
    return [...linkSuggestions(pages, text, 60), ...drawings];
  }, [pages, text, searching]);

  const edit = (next: string) => {
    setText(next);
    setTarget(null);
    // typing a name highlights the best match; an empty box just lists the outline
    setActive(next.trim() && !looksLikeAddress(next.trim()) ? 0 : -1);
    onEdit?.();
  };

  // a link copied from this same drawing is stored in its short form
  const choose = (v: string) => onSubmit(localizeLink(v.trim(), projectId));
  const submit = () => {
    if (target) choose(target);
    else if (active >= 0 && suggestions[active]) choose(suggestions[active].link);
    else choose(text);
  };

  return (
    <div className="link-field">
      <div className="link-editor-row">
        {leading}
        {target && (
          <span className={`link-target-chip ${chipLabel ? "" : "missing"}`} title={chipLabel ? `Jumps to ${chipLabel}` : "The linked page or element no longer exists"}>
            ↪ {chipLabel ?? "Missing target"}
            <button title="Clear" onPointerDown={(e) => e.preventDefault()} onClick={() => edit("")}>
              <X size={12} />
            </button>
          </span>
        )}
        <input
          autoFocus
          value={text}
          placeholder={target ? "" : placeholder}
          onChange={(e) => {
            // pasting a copied link shows it as a target chip
            const v = e.target.value.trim();
            if (isInternalLink(v) && !target) {
              setText("");
              setTarget(localizeLink(v, projectId));
              setActive(-1);
              onEdit?.();
            } else edit(e.target.value);
          }}
          onBlur={onBlur}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            } else if (e.key === "Escape") onCancel();
            else if (e.key === "Backspace" && target && !text) edit("");
            else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && suggestions.length) {
              e.preventDefault();
              const n = suggestions.length;
              setActive((i) => (e.key === "ArrowDown" ? (i + 1) % n : i <= 0 ? n - 1 : i - 1));
            }
          }}
        />
        {trailing}
        <button className="primary" onPointerDown={(e) => e.preventDefault()} onClick={submit}>
          Save
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="link-suggestions" role="listbox">
          {suggestions.map((sg, i) => {
            const Icon = KIND_ICON[sg.kind];
            return (
              <button
                key={sg.link}
                role="option"
                aria-selected={i === active}
                className={i === active ? "active" : ""}
                // keep focus in the input so blur handlers don't close the editor
                onPointerDown={(e) => e.preventDefault()}
                onPointerEnter={() => setActive(i)}
                onClick={() => choose(sg.link)}
              >
                <Icon size={14} />
                <span className="sg-label">{sg.label}</span>
                {sg.kind !== "page" && <span className="sg-page">{sg.pageName}</span>}
              </button>
            );
          })}
        </div>
      )}
      {onPick && (
        <div className="link-field-foot">
          <span>{searching && !text ? "Type to search this drawing, or paste a web address" : searching ? "↑↓ to choose · Enter to link" : "Enter to link"}</span>
          <button onPointerDown={(e) => e.preventDefault()} onClick={onPick} title="Click any element, on any page, to link to it">
            <Crosshair size={13} /> Pick on canvas
          </button>
        </div>
      )}
    </div>
  );
}

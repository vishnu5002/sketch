import { useMemo, useState } from "react";
import { CornerUpLeft } from "lucide-react";
import { useStore } from "../store";
import { goToInternal } from "../linkNav";
import { backlinksTo, elementLabel, elementLink } from "../utils/internalLinks";
import { getCommonBounds } from "../utils/geometry";
import { sceneToScreen } from "../utils/viewport";

/** Under the selection: how many links elsewhere point at it, and a list to jump to them. */
export default function Backlinks() {
  const selectedIds = useStore((s) => s.selectedIds);
  const elements = useStore((s) => s.elements);
  const storedPages = useStore((s) => s.pages);
  const activePageId = useStore((s) => s.activePageId);
  const viewport = useStore((s) => s.viewport);
  const editingTextId = useStore((s) => s.editingTextId);
  const linkPick = useStore((s) => s.linkPick);
  const [open, setOpen] = useState<string | null>(null);

  const key = selectedIds.join(",");
  const links = useMemo(() => {
    if (!selectedIds.length) return [];
    const ids = new Set(selectedIds);
    const pages = storedPages.map((p) => (p.id === activePageId ? { ...p, elements } : p));
    // links from inside the selection (a card linking to itself) don't count
    return backlinksTo(pages, ids).filter((b) => !(b.page.id === activePageId && ids.has(b.element.id)));
  }, [selectedIds, storedPages, activePageId, elements]);

  if (!links.length || editingTextId || linkPick) return null;
  const sel = elements.filter((e) => selectedIds.includes(e.id));
  const b = getCommonBounds(sel);
  if (!b) return null;
  const p = sceneToScreen({ x: b.x1, y: b.y2 }, viewport);

  return (
    <div className="backlinks" style={{ left: Math.max(8, p.x), top: p.y + 8 }} onPointerDown={(e) => e.stopPropagation()}>
      <button className="backlinks-chip" onClick={() => setOpen(open === key ? null : key)} title="Places that link here">
        <CornerUpLeft size={13} /> Linked from {links.length} place{links.length === 1 ? "" : "s"}
      </button>
      {open === key && (
        <div className="backlinks-list">
          {links.map((l, i) => (
            <button
              key={l.element.id + i}
              onClick={() => {
                setOpen(null);
                goToInternal(elementLink(l.page.id, l.element.id));
              }}
            >
              <span className="sg-label">{l.text ? `“${l.text}” in ${elementLabel(l.element)}` : elementLabel(l.element)}</span>
              <span className="sg-page">{l.page.name}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";
import { Plus, MoreHorizontal } from "lucide-react";
import { livePages, useStore } from "../store";
import { backlinksTo } from "../utils/internalLinks";
import { snapshotNow } from "../utils/versions";

export default function PagesBar() {
  const pages = useStore((s) => s.pages);
  const activePageId = useStore((s) => s.activePageId);
  const elements = useStore((s) => s.elements);
  const viewMode = useStore((s) => s.viewMode);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const st = useStore.getState;

  useEffect(() => {
    if (!menuFor) return;
    const close = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuFor(null);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [menuFor]);

  const remove = (id: string) => {
    const page = pages.find((p) => p.id === id);
    const count = id === activePageId ? elements.length : page?.elements.length ?? 0;
    // links from other pages to this page or anything on it
    const pageEls = id === activePageId ? elements : page?.elements ?? [];
    const others = livePages().filter((p) => p.id !== id);
    const links = backlinksTo(others, new Set(pageEls.map((e) => e.id)), id).length;
    const linkNote = links ? ` ${links} link${links === 1 ? "" : "s"} on other pages point${links === 1 ? "s" : ""} here and will stop working.` : "";
    if ((count === 0 && !links) || confirm(`Delete "${page?.name}" and its ${count} element${count === 1 ? "" : "s"}?${linkNote} You can get it back from Version history.`)) {
      snapshotNow("safety", { reason: `Before deleting page “${page?.name}”` }).then(() => st().deletePage(id));
    }
  };

  return (
    <div className="pages-bar" onPointerDown={(e) => e.stopPropagation()}>
      {pages.map((p) => (
        <div key={p.id} className={`page-tab ${p.id === activePageId ? "active" : ""}`}>
          {renaming === p.id ? (
            <input
              autoFocus
              defaultValue={p.name}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                if (e.key === "Escape") setRenaming(null);
              }}
              onBlur={(e) => {
                st().renamePage(p.id, e.target.value);
                setRenaming(null);
              }}
            />
          ) : (
            <button className="page-name" onClick={() => st().switchPage(p.id)} onDoubleClick={() => !viewMode && setRenaming(p.id)} title={viewMode ? p.name : "Double-click to rename"}>
              {p.name}
            </button>
          )}
          {p.id === activePageId && renaming !== p.id && !viewMode && (
            <button className="page-more" onClick={() => setMenuFor(menuFor === p.id ? null : p.id)} title="Page options">
              <MoreHorizontal size={14} />
            </button>
          )}
          {menuFor === p.id && (
            <div ref={menuRef} className="dropdown page-menu">
              <button
                onClick={() => {
                  setRenaming(p.id);
                  setMenuFor(null);
                }}
              >
                Rename
              </button>
              <button
                onClick={() => {
                  st().duplicatePage(p.id);
                  setMenuFor(null);
                }}
              >
                Duplicate
              </button>
              {pages.length > 1 && (
                <button
                  className="danger"
                  onClick={() => {
                    setMenuFor(null);
                    remove(p.id);
                  }}
                >
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      {!viewMode && (
        <button className="page-add" title="New page" onClick={() => st().addPage()}>
          <Plus size={15} />
        </button>
      )}
    </div>
  );
}

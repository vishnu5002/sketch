import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { toggleViewMode, addSelectionToLibrary, copyAsPNG, copyAsSVG, copySelection, cutSelection, pastePayload, selectedElements, zoomToFit, zoomToSelection, insertContents } from "../actions";
import { copyLinkTo } from "../linkNav";
import { readClipboard } from "../utils/clipboard";

type Item = { label: string; kbd?: string; onClick: () => void; danger?: boolean; hidden?: boolean } | "divider";

export default function ContextMenu() {
  const menu = useStore((s) => s.contextMenu);
  const elements = useStore((s) => s.elements);
  const selectedIds = useStore((s) => s.selectedIds);
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ x: 0, y: 0 });

  useLayoutEffect(() => {
    if (!menu || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    setPos({ x: Math.min(menu.x, window.innerWidth - r.width - 8), y: Math.min(menu.y, window.innerHeight - r.height - 8) });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) useStore.getState().setUI({ contextMenu: null });
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [menu]);

  if (!menu) return null;
  const st = useStore.getState;
  const target = menu.targetId ? elements.find((e) => e.id === menu.targetId) : undefined;
  const sel = selectedElements();
  const single = sel.length === 1 ? sel[0] : undefined;

  let items: Item[];
  if (st().viewMode) {
    items = [
      { label: "Back to editing", kbd: "Alt+R", onClick: toggleViewMode },
      "divider",
      { label: "Zoom to fit", kbd: "Shift+1", onClick: zoomToFit },
      { label: "Copy page as PNG", onClick: () => copyAsPNG(elements) },
      { label: "Export image…", kbd: "Ctrl+Shift+E", onClick: () => st().setUI({ exportOpen: true }) },
    ];
  } else if (target?.locked) {
    items = [{ label: "Unlock", kbd: "Ctrl+Shift+L", onClick: () => st().toggleLock([target.id]) }, "divider", { label: "Unlock all", onClick: () => st().unlockAll() }];
  } else if (sel.length) {
    items = [
      { label: "Cut", kbd: "Ctrl+X", onClick: cutSelection },
      { label: "Copy", kbd: "Ctrl+C", onClick: copySelection },
      { label: "Paste", kbd: "Ctrl+V", onClick: async () => pastePayload(await readClipboard(), menu.scene) },
      { label: "Duplicate", kbd: "Ctrl+D", onClick: () => st().duplicateSelected() },
      "divider",
      { label: "Copy as PNG", kbd: "Shift+Alt+C", onClick: () => copyAsPNG(sel) },
      { label: "Copy as SVG", onClick: () => copyAsSVG(sel) },
      "divider",
      {
        label: single?.link ? "Edit link" : "Add link",
        kbd: "Ctrl+K",
        hidden: !single || single.type === "embed",
        onClick: () => single && st().setUI({ linkEditor: { elementId: single.id, mode: "link" } }),
      },
      { label: "Copy link to this", hidden: !single, onClick: () => single && copyLinkTo(single.id) },
      { label: "Edit embed URL", hidden: single?.type !== "embed", onClick: () => single && st().setUI({ linkEditor: { elementId: single.id, mode: "embed" } }) },
      { label: "Interact with embed", hidden: single?.type !== "embed" || !single.link, onClick: () => single && st().setUI({ activeEmbedId: single.id }) },
      { label: "Rename frame", hidden: single?.type !== "frame", onClick: () => single && st().setUI({ editingFrameId: single.id }) },
      { label: "Group selection", kbd: "Ctrl+G", hidden: sel.length < 2, onClick: () => st().groupSelected() },
      { label: "Ungroup", kbd: "Ctrl+Shift+G", hidden: !sel.some((e) => e.groupId), onClick: () => st().ungroupSelected() },
      { label: "Add to library", kbd: "Alt+L", onClick: addSelectionToLibrary },
      { label: "Lock", kbd: "Ctrl+Shift+L", onClick: () => st().toggleLock(selectedIds) },
      "divider",
      { label: "Flip horizontal", kbd: "Shift+H", onClick: () => st().flipSelected("x") },
      { label: "Flip vertical", kbd: "Shift+V", onClick: () => st().flipSelected("y") },
      { label: "Zoom to selection", kbd: "Shift+2", onClick: zoomToSelection },
      "divider",
      { label: "Bring to front", kbd: "Ctrl+Shift+]", onClick: () => st().bringToFront(selectedIds) },
      { label: "Bring forward", kbd: "Ctrl+]", onClick: () => st().bringForward(selectedIds) },
      { label: "Send backward", kbd: "Ctrl+[", onClick: () => st().sendBackward(selectedIds) },
      { label: "Send to back", kbd: "Ctrl+Shift+[", onClick: () => st().sendToBack(selectedIds) },
      "divider",
      { label: "Delete", kbd: "Del", danger: true, onClick: () => st().deleteElements(selectedIds) },
    ];
  } else {
    const s = st();
    items = [
      { label: "Paste", kbd: "Ctrl+V", onClick: async () => pastePayload(await readClipboard(), menu.scene) },
      { label: "Select all", kbd: "Ctrl+A", onClick: () => s.selectAll() },
      { label: "Copy link to this page", onClick: () => copyLinkTo() },
      { label: "Insert contents (linked)", onClick: () => insertContents(menu.scene) },
      { label: "Unlock all", hidden: !elements.some((e) => e.locked), onClick: () => s.unlockAll() },
      "divider",
      { label: s.gridEnabled ? "Hide grid" : "Show grid", kbd: "Ctrl+'", onClick: () => s.toggleGrid() },
      { label: s.snapEnabled ? "Turn off snapping" : "Turn on snapping", kbd: "Alt+S", onClick: () => s.toggleSnap() },
      { label: s.showStats ? "Hide stats" : "Show stats", kbd: "Alt+/", onClick: () => s.setUI({ showStats: !s.showStats }) },
      { label: "Zoom to fit", kbd: "Shift+1", onClick: zoomToFit },
      "divider",
      { label: "Copy page as PNG", onClick: () => copyAsPNG(elements) },
      { label: "Export image…", kbd: "Ctrl+Shift+E", onClick: () => s.setUI({ exportOpen: true }) },
    ];
  }

  const visible = items.filter((i) => i === "divider" || !i.hidden).filter((i, idx, arr) => i !== "divider" || (idx > 0 && arr[idx - 1] !== "divider" && idx < arr.length - 1));

  return (
    <div ref={ref} className="dropdown context-menu" style={{ left: pos.x || menu.x, top: pos.y || menu.y }} onContextMenu={(e) => e.preventDefault()}>
      {visible.map((i, idx) =>
        i === "divider" ? (
          <div key={idx} className="menu-divider" />
        ) : (
          <button
            key={i.label}
            className={i.danger ? "danger" : ""}
            onClick={() => {
              useStore.getState().setUI({ contextMenu: null });
              i.onClick();
            }}
          >
            <span className="menu-label">{i.label}</span>
            {i.kbd && <kbd>{i.kbd}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}

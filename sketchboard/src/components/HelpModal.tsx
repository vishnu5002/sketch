import { X } from "lucide-react";
import { useStore } from "../store";

const SECTIONS: [string, [string, string][]][] = [
  [
    "Tools",
    [
      ["V / 1", "Selection"],
      ["H / Space+drag", "Hand (pan)"],
      ["R / 2", "Rectangle"],
      ["D / 3", "Diamond"],
      ["O / 4", "Ellipse"],
      ["A / 5", "Arrow"],
      ["L / 6", "Line"],
      ["P / 7", "Draw"],
      ["T / 8", "Text"],
      ["N", "Sticky note"],
      ["9", "Image"],
      ["E / 0", "Eraser"],
      ["F", "Frame"],
      ["W", "Web embed"],
      ["K", "Laser pointer"],
      ["Q", "Keep tool active"],
    ],
  ],
  [
    "Editing",
    [
      ["Ctrl+Z / Ctrl+Shift+Z", "Undo / redo"],
      ["Ctrl+C / X / V", "Copy / cut / paste"],
      ["Ctrl+D", "Duplicate"],
      ["Alt+drag", "Duplicate while dragging"],
      ["Ctrl+A", "Select all"],
      ["Ctrl+G / Ctrl+Shift+G", "Group / ungroup"],
      ["Ctrl+K", "Add or edit link"],
      ["Ctrl+click", "Open element's link"],
      ["Ctrl+Shift+L", "Lock / unlock"],
      ["Shift+H / Shift+V", "Flip horizontal / vertical"],
      ["Ctrl+] / Ctrl+[", "Bring forward / send backward"],
      ["Ctrl+Shift+] / [", "Bring to front / send to back"],
      ["Arrow keys", "Nudge (Shift = 10px)"],
      ["Enter", "Edit text of selected shape"],
      ["Double-click", "Edit text · rename frame · interact with embed"],
      ["Del / Backspace", "Delete"],
      ["Alt+L", "Add selection to library"],
    ],
  ],
  [
    "Drawing",
    [
      ["Shift (while drawing)", "Square / circle / 15° angles"],
      ["Shift (resizing)", "Keep aspect ratio (images: free resize)"],
      ["Ctrl (while dragging)", "Temporarily disable snapping"],
      ["Click, click…", "Multi-point line — Enter or double-click to finish"],
      ["Drag a line's midpoint", "Add a bend point"],
      ["Arrow onto a shape", "Binds — the arrow follows when the shape moves"],
      ["Paste a URL", "YouTube/Figma/etc. become embeds, others linked text"],
    ],
  ],
  [
    "View & file",
    [
      ["Scroll / Shift+scroll", "Pan"],
      ["Ctrl+scroll / pinch", "Zoom"],
      ["Alt+R", "View mode — pan, click links, use embeds, no editing"],
      ["Alt+H", "Version history"],
      ["Ctrl+= / Ctrl+- / Ctrl+0", "Zoom in / out / 100%"],
      ["Shift+1 / Shift+2", "Zoom to fit / to selection"],
      ["Ctrl+'", "Toggle grid"],
      ["Alt+S", "Toggle snapping"],
      ["Alt+/", "Toggle stats"],
      ["Alt+M", "Toggle minimap"],
      ["Ctrl+F", "Find on canvas"],
      ["Ctrl+S / Ctrl+Shift+S", "Save / save as"],
      ["Ctrl+O", "Open"],
      ["Ctrl+Shift+E", "Export image"],
      ["Shift+Alt+C", "Copy as PNG"],
    ],
  ],
];

export default function HelpModal() {
  const open = useStore((s) => s.helpOpen);
  if (!open) return null;
  const close = () => useStore.getState().setUI({ helpOpen: false });
  return (
    <div className="modal-backdrop" onPointerDown={close}>
      <div className="modal help-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Keyboard shortcuts</h2>
          <button onClick={close} title="Close">
            <X size={18} />
          </button>
        </div>
        <div className="help-columns">
          {SECTIONS.map(([title, rows]) => (
            <section key={title}>
              <h3>{title}</h3>
              {rows.map(([k, d]) => (
                <div className="shortcut-row" key={k + d}>
                  <span>{d}</span>
                  <kbd>{k}</kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}

import { useState } from "react";
import { BookPlus, Download, Upload, X, Trash2 } from "lucide-react";
import { useStore } from "../store";
import { addSelectionToLibrary, pastePayload, sceneCenter } from "../actions";
import { downloadBlob, readFileAsText } from "../utils/exportScene";
import { pickFile } from "../utils/fileActions";
import Thumbnail from "./Thumbnail";

export default function LibraryPanel() {
  const show = useStore((s) => s.showLibrary);
  const library = useStore((s) => s.library);
  const hasSelection = useStore((s) => s.selectedIds.length > 0);
  const theme = useStore((s) => s.theme);
  const [renaming, setRenaming] = useState<string | null>(null);
  if (!show) return null;
  const st = useStore.getState;

  const exportLib = () => {
    const blob = new Blob([JSON.stringify({ type: "sketchboard-library", version: 1, items: library }, null, 2)], { type: "application/json" });
    downloadBlob(blob, "library.sketchboard-lib.json");
  };

  const importLib = async () => {
    const file = await pickFile(".json,application/json");
    if (!file) return;
    try {
      const data = JSON.parse(await readFileAsText(file));
      const items = Array.isArray(data.items) ? data.items : Array.isArray(data) ? data : null;
      if (!items) throw new Error();
      st().importLibrary(items);
      st().showToast(`Imported ${items.length} item${items.length === 1 ? "" : "s"}`);
    } catch {
      st().showToast("That isn't a sketchboard library file");
    }
  };

  return (
    <aside className="library-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel-header">
        <span>Library</span>
        <div className="panel-actions">
          <button title="Add selection to library (Alt+L)" disabled={!hasSelection} onClick={addSelectionToLibrary}>
            <BookPlus size={16} />
          </button>
          <button title="Import library" onClick={importLib}>
            <Upload size={16} />
          </button>
          <button title="Export library" disabled={!library.length} onClick={exportLib}>
            <Download size={16} />
          </button>
          <button title="Close" onClick={() => st().setUI({ showLibrary: false })}>
            <X size={16} />
          </button>
        </div>
      </div>
      {library.length === 0 ? (
        <div className="library-empty">
          <BookPlus size={28} />
          <p>Your library is empty.</p>
          <p className="muted">Select elements on the canvas and press the + button (or Alt+L) to save them here. Click or drag items back onto the canvas to reuse them.</p>
        </div>
      ) : (
        <div className="library-grid">
          {library.map((item) => (
            <div
              key={item.id}
              className="library-item"
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData("application/x-sketchboard-library", item.id);
                e.dataTransfer.effectAllowed = "copy";
              }}
              onClick={() => pastePayload({ elements: item.elements }, sceneCenter())}
              title="Click to insert, or drag onto the canvas"
            >
              <div className="library-thumb">
                <Thumbnail elements={item.elements} dark={theme === "dark"} />
              </div>
              {renaming === item.id ? (
                <input
                  autoFocus
                  defaultValue={item.name}
                  onClick={(e) => e.stopPropagation()}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
                  }}
                  onBlur={(e) => {
                    st().renameLibraryItem(item.id, e.target.value.trim() || item.name);
                    setRenaming(null);
                  }}
                />
              ) : (
                <span
                  className="library-name"
                  onDoubleClick={(e) => {
                    e.stopPropagation();
                    setRenaming(item.id);
                  }}
                >
                  {item.name}
                </span>
              )}
              <button
                className="library-delete"
                title="Remove from library"
                onClick={(e) => {
                  e.stopPropagation();
                  st().removeLibraryItem(item.id);
                }}
              >
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

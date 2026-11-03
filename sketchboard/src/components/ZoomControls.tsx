import { Minus, Plus, Maximize, Undo2, Redo2 } from "lucide-react";
import { useStore } from "../store";
import { setZoom, zoomBy, zoomToFit } from "../actions";

export default function ZoomControls() {
  const zoom = useStore((s) => s.viewport.zoom);
  const undo = useStore((s) => s.undo);
  const redo = useStore((s) => s.redo);
  const canUndo = useStore((s) => s.past.length > 0);
  const canRedo = useStore((s) => s.future.length > 0);
  const viewMode = useStore((s) => s.viewMode);

  return (
    <div className="bottom-bar">
      <div className="zoom-controls">
        <button onClick={() => zoomBy(1 / 1.2)} title="Zoom out (Ctrl+-)">
          <Minus size={16} />
        </button>
        <button className="zoom-pct" onClick={() => setZoom(1)} title="Reset zoom (Ctrl+0)">
          {Math.round(zoom * 100)}%
        </button>
        <button onClick={() => zoomBy(1.2)} title="Zoom in (Ctrl+=)">
          <Plus size={16} />
        </button>
        <button onClick={zoomToFit} title="Zoom to fit (Shift+1)">
          <Maximize size={15} />
        </button>
      </div>
      {!viewMode && <div className="zoom-controls">
        <button onClick={undo} disabled={!canUndo} title="Undo (Ctrl+Z)">
          <Undo2 size={16} />
        </button>
        <button onClick={redo} disabled={!canRedo} title="Redo (Ctrl+Shift+Z)">
          <Redo2 size={16} />
        </button>
      </div>}
    </div>
  );
}

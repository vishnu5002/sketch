import { Eye, Hand, Wand2, PencilLine } from "lucide-react";
import { useStore } from "../store";
import { toggleViewMode } from "../actions";

export default function ViewModeBar() {
  const viewTool = useStore((s) => s.viewTool);
  const setUI = useStore((s) => s.setUI);
  return (
    <div className="view-mode-bar">
      <span className="view-mode-label">
        <Eye size={15} /> View mode
      </span>
      <div className="toolbar-divider" />
      <button className={`toolbar-btn ${viewTool === "pan" ? "active" : ""}`} title="Pan & follow links — H" onClick={() => setUI({ viewTool: "pan" })}>
        <Hand size={17} strokeWidth={1.75} />
      </button>
      <button className={`toolbar-btn ${viewTool === "laser" ? "active" : ""}`} title="Laser pointer — K" onClick={() => setUI({ viewTool: "laser" })}>
        <Wand2 size={17} strokeWidth={1.75} />
      </button>
      <div className="toolbar-divider" />
      <button className="view-mode-exit" title="Back to editing — Alt+R" onClick={toggleViewMode}>
        <PencilLine size={15} /> Edit
      </button>
    </div>
  );
}

import { useState, type ReactNode } from "react";
import {
  Menu as MenuIcon,
  FolderOpen,
  Save,
  Download,
  Trash2,
  Sun,
  Moon,
  Grid3x3,
  Keyboard,
  Magnet,
  BarChart3,
  Map as MapIcon,
  LayoutTemplate,
  Search,
  Check,
  FilePlus2,
  Eye,
  File as FileIcon,
  Home,
  Link2,
  History,
} from "lucide-react";
import { useStore } from "../store";
import { exportJson, newDocument, openDocument, saveDocument } from "../utils/fileActions";
import { goHome } from "../project";
import { toggleViewMode } from "../actions";
import { snapshotNow } from "../utils/versions";

const CANVAS_BGS = ["#ffffff", "#f8f9fa", "#f5faff", "#fffce8", "#fdf8f6", "#f3f0ff"];

export default function TopMenu() {
  const [open, setOpen] = useState(false);
  const theme = useStore((s) => s.theme);
  const gridEnabled = useStore((s) => s.gridEnabled);
  const snapEnabled = useStore((s) => s.snapEnabled);
  const showStats = useStore((s) => s.showStats);
  const showMinimap = useStore((s) => s.showMinimap);
  const canvasBg = useStore((s) => s.canvasBg);
  const viewMode = useStore((s) => s.viewMode);
  const project = useStore((s) => s.project);
  const st = useStore.getState;

  const item = (icon: ReactNode, label: string, onClick: () => void, opts: { kbd?: string; checked?: boolean; danger?: boolean } = {}) => (
    <button
      className={opts.danger ? "danger" : ""}
      onClick={() => {
        onClick();
        setOpen(false);
      }}
    >
      {icon}
      <span className="menu-label">{label}</span>
      {opts.checked !== undefined && <span className="menu-check">{opts.checked && <Check size={14} />}</span>}
      {opts.kbd && <kbd>{opts.kbd}</kbd>}
    </button>
  );

  return (
    <div className="top-menu">
      <button className="island-btn" onClick={() => setOpen((o) => !o)} title="Menu">
        <MenuIcon size={18} />
      </button>
      {open && (
        <>
          <div className="menu-backdrop" onClick={() => setOpen(false)} />
          <div className="dropdown menu-dropdown">
            {item(<Home size={16} />, "All drawings (Home)", goHome)}
            {item(<FileIcon size={16} />, "New drawing", newDocument)}
            {item(<FolderOpen size={16} />, "Open / import .json…", openDocument, { kbd: "Ctrl+O" })}
            <div className="menu-divider" />
            {item(<Save size={16} />, "Save checkpoint", () => saveDocument(false), { kbd: "Ctrl+S" })}
            {item(<FilePlus2 size={16} />, "Export .json…", () => exportJson(), { kbd: "Ctrl+Shift+S" })}
            {project && item(<Link2 size={16} />, project.linkedPath ? "Linked file…" : "Link to a file…", () => st().setUI({ linkDialogFor: project.id }))}
            {item(<Download size={16} />, "Export image…", () => st().setUI({ exportOpen: true }), { kbd: "Ctrl+Shift+E" })}
            {!viewMode && item(<LayoutTemplate size={16} />, "Templates…", () => st().setUI({ templatesOpen: true }))}
            {item(<History size={16} />, "Version history", () => st().setUI({ showVersions: true, showLibrary: false }), { kbd: "Alt+H" })}
            {item(<Search size={16} />, "Find on canvas", () => st().setUI({ searchOpen: true }), { kbd: "Ctrl+F" })}
            <div className="menu-divider" />
            {item(<Eye size={16} />, "View mode", toggleViewMode, { checked: viewMode, kbd: "Alt+R" })}
            {item(<Grid3x3 size={16} />, "Grid", st().toggleGrid, { checked: gridEnabled, kbd: "Ctrl+'" })}
            {item(<Magnet size={16} />, "Snap to objects", st().toggleSnap, { checked: snapEnabled, kbd: "Alt+S" })}
            {item(<BarChart3 size={16} />, "Stats", () => st().setUI({ showStats: !showStats }), { checked: showStats, kbd: "Alt+/" })}
            {item(<MapIcon size={16} />, "Minimap", () => st().setUI({ showMinimap: !showMinimap }), { checked: showMinimap, kbd: "Alt+M" })}
            {item(theme === "dark" ? <Sun size={16} /> : <Moon size={16} />, theme === "dark" ? "Light mode" : "Dark mode", st().toggleTheme)}
            <div className="menu-section-label">Canvas background</div>
            <div className="swatch-row menu-swatches">
              {CANVAS_BGS.map((c) => (
                <button key={c} className={`swatch ${canvasBg === c ? "active" : ""}`} style={{ background: c }} title={c} onClick={() => st().setCanvasBg(c)} />
              ))}
              <label className="swatch custom-swatch" title="Custom background" style={{ background: canvasBg }}>
                <input type="color" value={canvasBg} onChange={(e) => st().setCanvasBg(e.target.value)} />
              </label>
            </div>
            <div className="menu-divider" />
            {item(<Keyboard size={16} />, "Keyboard shortcuts", () => st().setUI({ helpOpen: true }), { kbd: "?" })}
            {!viewMode && item(
              <Trash2 size={16} />,
              "Clear page",
              () => {
                if (confirm("Clear everything on this page? You can undo this with Ctrl+Z.")) {
                  snapshotNow("safety", { reason: "Before clearing a page" }).then(() => st().clearCanvas());
                }
              },
              { danger: true },
            )}
          </div>
        </>
      )}
    </div>
  );
}

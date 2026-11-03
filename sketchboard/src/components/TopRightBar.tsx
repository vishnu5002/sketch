import { Search, Library, HelpCircle, Eye, History } from "lucide-react";
import { useStore } from "../store";
import { toggleViewMode } from "../actions";

export default function TopRightBar() {
  const showLibrary = useStore((s) => s.showLibrary);
  const searchOpen = useStore((s) => s.searchOpen);
  const setUI = useStore((s) => s.setUI);
  const viewMode = useStore((s) => s.viewMode);
  const showVersions = useStore((s) => s.showVersions);
  return (
    <div className="top-right-bar">
      <button className={`island-btn ${searchOpen ? "active" : ""}`} title="Find on canvas (Ctrl+F)" onClick={() => setUI({ searchOpen: !searchOpen })}>
        <Search size={17} />
      </button>
      <button className={`island-btn ${showVersions ? "active" : ""}`} title="Version history (Alt+H)" onClick={() => setUI({ showVersions: !showVersions, showLibrary: false })}>
        <History size={17} />
      </button>
      {!viewMode && (
        <button className="island-btn" title="View mode — browse, follow links and use embeds without editing (Alt+R)" onClick={toggleViewMode}>
          <Eye size={17} />
        </button>
      )}
      {!viewMode && (
        <button className={`island-btn with-label ${showLibrary ? "active" : ""}`} title="Library" onClick={() => setUI({ showLibrary: !showLibrary, showVersions: false })}>
          <Library size={17} /> <span>Library</span>
        </button>
      )}
      <button className="island-btn" title="Keyboard shortcuts (?)" onClick={() => setUI({ helpOpen: true })}>
        <HelpCircle size={17} />
      </button>
    </div>
  );
}

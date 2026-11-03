import { useEffect, useState } from "react";
import Canvas from "./components/Canvas";
import Toolbar from "./components/Toolbar";
import StylePanel from "./components/StylePanel";
import ZoomControls from "./components/ZoomControls";
import TopMenu from "./components/TopMenu";
import TopRightBar from "./components/TopRightBar";
import HelpModal from "./components/HelpModal";
import ContextMenu from "./components/ContextMenu";
import LinkEditor from "./components/LinkEditor";
import LinkNavBar from "./components/LinkNavBar";
import StatsPanel from "./components/StatsPanel";
import SearchBox from "./components/SearchBox";
import Minimap from "./components/Minimap";
import PagesBar from "./components/PagesBar";
import LibraryPanel from "./components/LibraryPanel";
import ExportDialog from "./components/ExportDialog";
import TemplatesModal from "./components/TemplatesModal";
import Toast from "./components/Toast";
import ViewModeBar from "./components/ViewModeBar";
import ProjectChip from "./components/ProjectChip";
import SyncBanner from "./components/SyncBanner";
import LinkFileDialog from "./components/LinkFileDialog";
import Home from "./components/Home";
import VersionPanel from "./components/VersionPanel";
import PreviewBanner from "./components/PreviewBanner";
import { migrateBrowserData } from "./migrate";
import { startLiveUpdates, startRouter } from "./project";
import { startLinkNav } from "./linkNav";
import { useStore } from "./store";
import "./app.css";

// Runs once per page load (React's StrictMode mounts effects twice in development).
let booting: Promise<void> | null = null;
const bootOnce = () =>
  (booting ??= boot().catch((err) => {
    booting = null;
    throw err;
  }));

async function boot() {
  try {
    const moved = await migrateBrowserData();
    if (moved && !moved.deleted) setTimeout(() => useStore.getState().showToast(`Moved “${moved.name}” from this browser into your sketchboard library`), 500);
  } catch {
    // Not fatal: the old data stays in the browser and migration retries next time.
  }
  await useStore.getState().hydrate();
  startLiveUpdates();
  startLinkNav();
  startRouter();
}

function ServiceDown({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="app-root loading service-down">
      <div>
        <h1>Can't reach the sketchboard service</h1>
        <p>Your drawings are stored by the local service, and it isn't answering. Start it with:</p>
        <pre>systemctl --user start sketchboard</pre>
        <p className="muted">
          Logs: <code>journalctl --user -u sketchboard -n 50</code>
        </p>
        <button className="primary" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}

function Editor() {
  const showLibrary = useStore((s) => s.showLibrary);
  const showMinimap = useStore((s) => s.showMinimap);
  const viewMode = useStore((s) => s.viewMode);
  const showVersions = useStore((s) => s.showVersions);
  const previewing = useStore((s) => !!s.preview);
  const project = useStore((s) => s.project);
  const status = useStore((s) => s.saveStatus);
  const waiting = useStore((s) => s.waitingForService);

  useEffect(() => {
    if (!project) return;
    const unsaved = status === "dirty" || status === "saving" || status === "offline" || status === "conflict" || status === "error";
    document.title = `${unsaved ? "• " : ""}${project.name} — sketchboard`;
  }, [project, status]);

  if (!project) return <div className="app-root loading">{waiting ? "Waiting for the sketchboard service to come back…" : "Opening drawing…"}</div>;

  return (
    <div className={`app-root ${showLibrary || showVersions ? "library-open" : ""} ${previewing ? "previewing" : ""} ${showMinimap ? "minimap-open" : ""} ${viewMode ? "view-mode" : ""}`}>
      <Canvas />
      <TopMenu />
      <ProjectChip />
      {previewing ? <PreviewBanner /> : viewMode ? <ViewModeBar /> : <Toolbar />}
      <SyncBanner />
      <LinkNavBar />
      <TopRightBar />
      {!viewMode && <StylePanel />}
      {!viewMode && <StatsPanel />}
      <SearchBox />
      <ZoomControls />
      <PagesBar />
      <Minimap />
      {!viewMode && <LibraryPanel />}
      <VersionPanel />
      {!viewMode && <LinkEditor />}
      <ContextMenu />
      <ExportDialog />
      <TemplatesModal />
      <HelpModal />
      <LinkFileDialog />
      <Toast />
    </div>
  );
}

function App() {
  const theme = useStore((s) => s.theme);
  const hydrated = useStore((s) => s.hydrated);
  const route = useStore((s) => s.route);
  const [down, setDown] = useState(false);

  const start = () => bootOnce().catch(() => setDown(true));

  useEffect(() => {
    start();
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem("sketchboard.theme", theme);
    } catch {
      // only used to paint the right theme before settings load
    }
  }, [theme]);

  if (down)
    return (
      <ServiceDown
        onRetry={() => {
          setDown(false);
          start();
        }}
      />
    );
  if (!hydrated) return <div className="app-root loading">Loading…</div>;
  return route.name === "home" ? <Home /> : <Editor />;
}

export default App;

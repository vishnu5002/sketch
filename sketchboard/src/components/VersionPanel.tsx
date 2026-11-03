import { useState } from "react";
import { BookmarkPlus, Eye, History, MoreHorizontal, RotateCcw, Trash2, Pencil, X, Shield, Save, Clock, Star } from "lucide-react";
import { useStore, type VersionMeta } from "../store";
import { deleteVersion, previewVersion, renameVersion, restoreVersion, snapshotNow } from "../utils/versions";

const KIND_TITLE: Record<VersionMeta["kind"], string> = {
  auto: "Auto-saved",
  named: "Named version",
  save: "Saved to file",
  safety: "Safety copy",
};

const KIND_ICON = { auto: Clock, named: Star, save: Save, safety: Shield };

function dayLabel(t: number): string {
  const d = new Date(t);
  const today = new Date();
  const yesterday = new Date(Date.now() - 86_400_000);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

const time = (t: number) => new Date(t).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

function VersionRow({ v, previewing, isLatest }: { v: VersionMeta; previewing: boolean; isLatest: boolean }) {
  const [menu, setMenu] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const Icon = KIND_ICON[v.kind];
  const title = v.label ?? v.reason ?? KIND_TITLE[v.kind];

  return (
    <div className={`version-row ${previewing ? "active" : ""}`} onClick={() => !renaming && previewVersion(v.id)}>
      <div className="version-thumb">{v.thumb ? <img src={v.thumb} alt="" draggable={false} /> : <History size={18} />}</div>
      <div className="version-info">
        {renaming ? (
          <input
            autoFocus
            defaultValue={v.label ?? ""}
            placeholder="Name this version"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter" || e.key === "Escape") (e.target as HTMLInputElement).blur();
            }}
            onBlur={(e) => {
              renameVersion(v.id, e.target.value);
              setRenaming(false);
            }}
          />
        ) : (
          <div className={`version-title ${v.kind === "named" ? "named" : ""}`}>
            <Icon size={12} />
            <span>{title}</span>
          </div>
        )}
        <div className="version-meta">
          {time(v.created)}
          {isLatest && <span className="version-badge">latest</span>}
        </div>
        <div className="version-summary">{v.summary}</div>
      </div>
      <div className="version-actions" onClick={(e) => e.stopPropagation()}>
        <button title="Preview" onClick={() => previewVersion(v.id)}>
          <Eye size={14} />
        </button>
        <button title="Restore this version" onClick={() => confirm(`Restore the version from ${dayLabel(v.created)} ${time(v.created)}? Your current drawing is saved as a version first.`) && restoreVersion(v.id)}>
          <RotateCcw size={14} />
        </button>
        <button title="More" onClick={() => setMenu((m) => !m)}>
          <MoreHorizontal size={14} />
        </button>
        {menu && (
          <div className="dropdown version-menu" onMouseLeave={() => setMenu(false)}>
            <button
              onClick={() => {
                setMenu(false);
                setRenaming(true);
              }}
            >
              <Pencil size={14} /> {v.label ? "Rename" : "Name & keep forever"}
            </button>
            <button
              className="danger"
              onClick={() => {
                setMenu(false);
                if (confirm("Delete this version? This can't be undone.")) deleteVersion(v.id);
              }}
            >
              <Trash2 size={14} /> Delete version
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export default function VersionPanel() {
  const show = useStore((s) => s.showVersions);
  const versions = useStore((s) => s.versions);
  const preview = useStore((s) => s.preview);
  const [naming, setNaming] = useState(false);
  const [label, setLabel] = useState("");
  if (!show) return null;

  const sorted = [...versions].reverse();
  const groups = new Map<string, VersionMeta[]>();
  for (const v of sorted) {
    const k = dayLabel(v.created);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(v);
  }

  const saveNamed = async () => {
    const l = label.trim() || `Version ${new Date().toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
    setNaming(false);
    setLabel("");
    const v = await snapshotNow("named", { label: l });
    if (v) useStore.getState().showToast(`Saved version “${l}”`);
  };

  return (
    <aside className="library-panel version-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel-header">
        <span>Version history</span>
        <div className="panel-actions">
          <button title="Close (Alt+H)" onClick={() => useStore.getState().setUI({ showVersions: false })}>
            <X size={16} />
          </button>
        </div>
      </div>

      {naming ? (
        <div className="version-name-row">
          <input
            autoFocus
            value={label}
            placeholder="e.g. Before client review"
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (e.key === "Enter") saveNamed();
              if (e.key === "Escape") setNaming(false);
            }}
          />
          <button className="primary" onClick={saveNamed}>
            Save
          </button>
        </div>
      ) : (
        <button className="wide-btn" disabled={!!preview} onClick={() => setNaming(true)} title={preview ? "Go back to the current drawing first" : "Snapshot the drawing now with a name"}>
          <BookmarkPlus size={15} /> Save version…
        </button>
      )}

      <div className="version-list">
        {sorted.length === 0 && (
          <div className="library-empty">
            <History size={28} />
            <p>No versions yet.</p>
            <p className="muted">Versions are saved automatically every few minutes while you work, whenever you save to a file, and before risky actions like clearing a page.</p>
          </div>
        )}
        {[...groups.entries()].map(([day, list]) => (
          <div key={day} className="version-group">
            <div className="font-section-title">{day}</div>
            {list.map((v) => (
              <VersionRow key={v.id} v={v} previewing={preview?.versionId === v.id} isLatest={v.id === sorted[0]?.id} />
            ))}
          </div>
        ))}
      </div>
      <div className="version-footer muted">
        {versions.length} version{versions.length === 1 ? "" : "s"} · auto-saved every 5 min while editing, thinned to hourly → daily → weekly over time · named versions are kept forever
      </div>
    </aside>
  );
}

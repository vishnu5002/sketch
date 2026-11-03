import { useState } from "react";
import { AlertTriangle, Check, CircleDot, CloudOff, Home, Link2, Loader2 } from "lucide-react";
import { useStore, type SaveStatus } from "../store";
import { flushSave, goHome, renameProject } from "../project";

const LABEL: Record<SaveStatus, string> = {
  saved: "Saved",
  dirty: "Saving soon…",
  saving: "Saving…",
  offline: "Offline — kept in this browser",
  conflict: "Changed in another window",
  error: "Save failed — click to retry",
};

const ICON: Record<SaveStatus, React.ReactNode> = {
  saved: <Check size={13} />,
  dirty: <CircleDot size={13} />,
  saving: <Loader2 size={13} className="spin" />,
  offline: <CloudOff size={13} />,
  conflict: <AlertTriangle size={13} />,
  error: <AlertTriangle size={13} />,
};

/** Top-left: back to Home, the project's name (click to rename) and its save state. */
export default function ProjectChip() {
  const project = useStore((s) => s.project);
  const status = useStore((s) => s.saveStatus);
  const [editing, setEditing] = useState(false);
  if (!project) return null;
  const fileName = project.linkedPath?.split("/").pop();

  return (
    <div className={`project-chip ${status}`}>
      <button className="chip-home" title="All drawings (Home)" onClick={goHome}>
        <Home size={16} />
      </button>
      {editing ? (
        <input
          className="chip-rename"
          autoFocus
          defaultValue={project.name}
          aria-label="Drawing name"
          onFocus={(e) => e.target.select()}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") e.currentTarget.blur();
            if (e.key === "Escape") {
              e.currentTarget.value = project.name;
              e.currentTarget.blur();
            }
          }}
          onBlur={(e) => {
            setEditing(false);
            renameProject(e.target.value).catch(() => useStore.getState().showToast("Couldn't rename"));
          }}
        />
      ) : (
        <button className="chip-name" title="Rename" onClick={() => setEditing(true)}>
          {project.name}
        </button>
      )}
      {fileName && (
        <button className={`chip-link ${project.fileState}`} title={`Linked to ${project.linkedPath} — written on every save`} onClick={() => useStore.getState().setUI({ linkDialogFor: project.id })}>
          <Link2 size={13} />
          <span>{fileName}</span>
        </button>
      )}
      <button className="chip-state" title={LABEL[status]} onClick={() => (status === "error" || status === "offline") && flushSave()}>
        {ICON[status]}
        <span className="chip-state-label">{LABEL[status]}</span>
      </button>
    </div>
  );
}

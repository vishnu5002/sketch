import { AlertTriangle, FileWarning } from "lucide-react";
import { useStore } from "../store";
import { resolveConflict, resolveFileChange, setLinked } from "../project";
import { projectsApi } from "../api";

/** Asks what to do when another window or an outside edit to the linked file got there first. */
export default function SyncBanner() {
  const project = useStore((s) => s.project);
  const status = useStore((s) => s.saveStatus);
  if (!project) return null;
  const fail = () => useStore.getState().showToast("That didn't work — is the sketchboard service running?");

  if (status === "conflict") {
    return (
      <div className="sync-banner" role="alert">
        <AlertTriangle size={16} />
        <span>
          <b>This drawing changed in another window.</b> Which version do you want?
        </span>
        <button onClick={() => resolveConflict("theirs").catch(fail)}>Use the other window's</button>
        <button className="primary" onClick={() => resolveConflict("mine").catch(fail)}>
          Keep mine
        </button>
      </div>
    );
  }
  const file = project.linkedPath?.split("/").pop();
  if (project.fileState === "changed") {
    return (
      <div className="sync-banner" role="alert">
        <FileWarning size={16} />
        <span>
          <b>{file}</b> was changed outside sketchboard.
        </span>
        <button onClick={() => resolveFileChange("reload").catch(fail)}>Reload from file</button>
        <button className="primary" onClick={() => resolveFileChange("keep").catch(fail)}>
          Keep mine
        </button>
      </div>
    );
  }
  if (project.fileState === "missing" || project.fileState === "error") {
    return (
      <div className="sync-banner" role="alert">
        <FileWarning size={16} />
        <span>
          <b>{file}</b> {project.fileState === "missing" ? "can't be found — it was moved or deleted." : "couldn't be written."} Your drawing is still saved here.
        </span>
        <button onClick={() => useStore.getState().setUI({ linkDialogFor: project.id })}>Link again…</button>
        <button onClick={() => projectsApi.unlink(project.id).then(setLinked).catch(fail)}>Unlink</button>
      </div>
    );
  }
  return null;
}

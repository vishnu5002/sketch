import { useEffect, useState } from "react";
import { FolderPlus, Link2, Unlink, X } from "lucide-react";
import { ApiError, foldersApi, projectsApi, type Folder, type ProjectMeta } from "../api";
import { setLinked } from "../project";
import { useStore } from "../store";

const slug = (name: string) => `${name.replace(/[\\/:*?"<>|]+/g, "_").trim() || "drawing"}.sketchboard.json`;

/** Link a project to a .json in one of the registered folders; the service writes it on every save. */
export default function LinkFileDialog({ onChanged }: { onChanged?: (m: ProjectMeta) => void }) {
  const id = useStore((s) => s.linkDialogFor);
  if (!id) return null;
  return <Dialog key={id} id={id} onChanged={onChanged} />;
}

function Dialog({ id, onChanged }: { id: string; onChanged?: (m: ProjectMeta) => void }) {
  const close = () => useStore.getState().setUI({ linkDialogFor: null });
  const [meta, setMeta] = useState<ProjectMeta | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderId, setFolderId] = useState("");
  const [fileName, setFileName] = useState("");
  const [newFolder, setNewFolder] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    Promise.all([projectsApi.get(id), foldersApi.list()])
      .then(([p, fs]) => {
        setMeta(p);
        setFolders(fs);
        setFolderId(fs[0]?.id ?? "");
        setFileName(slug(p.name));
      })
      .catch(() => setError("Couldn't load — is the sketchboard service running?"));
  }, [id]);

  const done = (m: ProjectMeta) => {
    setLinked(m);
    onChanged?.(m);
    close();
  };

  const addFolder = async () => {
    setError(null);
    try {
      const f = await foldersApi.add(newFolder);
      setFolders((fs) => (fs.some((x) => x.id === f.id) ? fs : [...fs, f]));
      setFolderId(f.id);
      setNewFolder("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't add that folder");
    }
  };

  const link = async (overwrite = false) => {
    setBusy(true);
    setError(null);
    try {
      done(await projectsApi.link(id, { folderId, fileName, overwrite }));
      useStore.getState().showToast(`Linked — saves now also write ${fileName}`);
    } catch (err) {
      if (err instanceof ApiError && err.body.code === "exists") {
        if (confirm(`${fileName} already exists in that folder. Replace it with this drawing?`)) return link(true);
      } else setError(err instanceof ApiError ? err.message : "Couldn't link — is the sketchboard service running?");
    } finally {
      setBusy(false);
    }
  };

  const unlink = async () => {
    try {
      done(await projectsApi.unlink(id));
      useStore.getState().showToast("Unlinked — the file is left as it is");
    } catch {
      setError("Couldn't unlink");
    }
  };

  return (
    <div className="modal-backdrop" onPointerDown={close}>
      <div className="modal link-file-modal" onPointerDown={(e) => e.stopPropagation()} role="dialog" aria-label="Link to a file">
        <div className="modal-header">
          <h2>Link to a file</h2>
          <button onClick={close} title="Close">
            <X size={18} />
          </button>
        </div>
        <p className="muted">
          Keeps a <code>.json</code> copy of <b>{meta?.name ?? "this drawing"}</b> in a folder you choose — handy for a git repo or a synced folder. The service rewrites it on every save, and tells you if it changes outside sketchboard.
        </p>

        {meta?.linkedPath && (
          <div className="link-current">
            <Link2 size={14} />
            <code title={meta.linkedPath}>{meta.linkedPath}</code>
            <button onClick={unlink}>
              <Unlink size={14} /> Unlink
            </button>
          </div>
        )}

        <label className="field-label">Folder</label>
        {folders.length ? (
          <select value={folderId} onChange={(e) => setFolderId(e.target.value)}>
            {folders.map((f) => (
              <option key={f.id} value={f.id}>
                {f.path}
              </option>
            ))}
          </select>
        ) : (
          <p className="muted small">No folders yet — add one below.</p>
        )}
        <div className="inline-row">
          <input value={newFolder} onChange={(e) => setNewFolder(e.target.value)} placeholder="Add a folder, e.g. ~/Documents/drawings" onKeyDown={(e) => e.key === "Enter" && newFolder.trim() && addFolder()} />
          <button onClick={addFolder} disabled={!newFolder.trim()}>
            <FolderPlus size={14} /> Add
          </button>
        </div>

        <label className="field-label">File name</label>
        <input value={fileName} onChange={(e) => setFileName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && folderId && link()} />

        {error && <p className="form-error">{error}</p>}
        <div className="modal-actions">
          <button onClick={close}>Cancel</button>
          <button className="primary" disabled={!folderId || !fileName.trim() || busy} onClick={() => link()}>
            {meta?.linkedPath ? "Link to this file instead" : "Link"}
          </button>
        </div>
      </div>
    </div>
  );
}

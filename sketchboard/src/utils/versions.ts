// Version history for the open project, stored by the service. The server dedupes
// identical snapshots, writes change summaries and thins old automatic versions.
import { api } from "../api";
import { useStore, type VersionKind, type VersionMeta } from "../store";
import type { DocumentFile, Page } from "../types";
import { cloneElements } from "./clone";
import { externalizeImages } from "./images";
import { thumbnail } from "./thumbnail";

const MIN = 60_000;
export const AUTO_INTERVAL = 5 * MIN;

const st = () => useStore.getState();

let projectId: string | null = null;
let changedSinceSnapshot = false;
let lastSnapshotAt = 0;

const setVersions = (versions: VersionMeta[]) => useStore.setState({ versions });

async function refresh() {
  if (!projectId) return;
  const id = projectId;
  const list = await api<VersionMeta[]>(`/api/projects/${id}/versions`).catch(() => null);
  if (list && projectId === id) {
    setVersions(list);
    lastSnapshotAt = list.at(-1)?.created ?? 0;
  }
}

/** The live document — never the version being previewed. */
export function realDocument(): DocumentFile {
  const s = st();
  if (s.preview) {
    const p = s.preview.saved;
    return { type: "sketchboard", version: 2, pages: p.pages, activePageId: p.activePageId, canvasBg: p.canvasBg };
  }
  return s.getDocument();
}

async function doSnapshot(kind: VersionKind, opts: { label?: string; reason?: string; force?: boolean }): Promise<VersionMeta | null> {
  const id = projectId;
  if (!id) return null;
  const { doc } = await externalizeImages(realDocument());
  const total = doc.pages.reduce((n, p) => n + p.elements.length, 0);
  if (!total && !opts.force && kind !== "named") return null;
  const meta = await api<VersionMeta | null>(`/api/projects/${id}/versions`, {
    body: { kind, label: opts.label, reason: opts.reason, force: opts.force, doc, thumb: await thumbnail(doc) },
  });
  changedSinceSnapshot = false;
  if (meta) lastSnapshotAt = Date.now();
  await refresh();
  return meta;
}

// Snapshots run one at a time so concurrent triggers can't interleave.
let queue: Promise<unknown> = Promise.resolve();

export function snapshotNow(kind: VersionKind, opts: { label?: string; reason?: string; force?: boolean } = {}): Promise<VersionMeta | null> {
  const run = queue.then(() => doSnapshot(kind, opts));
  queue = run.catch(() => null);
  return run.catch(() => {
    st().showToast("Couldn't save a version — is the sketchboard service running?");
    return null;
  });
}

interface StoredDoc {
  pages: Page[];
  activePageId: string;
  canvasBg?: string;
}

export async function loadVersion(id: string): Promise<StoredDoc | null> {
  try {
    const v = await api<{ doc: DocumentFile }>(`/api/versions/${id}`);
    return v.doc;
  } catch {
    return null;
  }
}

export async function previewVersion(id: string) {
  const doc = await loadVersion(id);
  if (!doc) {
    st().showToast("That version is no longer available");
    return;
  }
  const s = st();
  const saved = s.preview?.saved ?? {
    pages: s.getDocument().pages,
    activePageId: s.activePageId,
    viewMode: s.viewMode,
    canvasBg: s.canvasBg,
  };
  const page = doc.pages.find((p) => p.id === s.activePageId) ?? doc.pages[0];
  useStore.setState({
    preview: { versionId: id, saved },
    pages: doc.pages,
    activePageId: page.id,
    elements: page.elements,
    canvasBg: doc.canvasBg ?? saved.canvasBg,
    viewMode: true,
    viewTool: "pan",
    selectedIds: [],
    editingTextId: null,
    contextMenu: null,
    linkEditor: null,
  });
}

export function exitPreview() {
  const p = st().preview;
  if (!p) return;
  const page = p.saved.pages.find((x) => x.id === p.saved.activePageId) ?? p.saved.pages[0];
  useStore.setState({
    preview: null,
    pages: p.saved.pages,
    activePageId: page.id,
    elements: page.elements,
    canvasBg: p.saved.canvasBg,
    viewMode: p.saved.viewMode,
    selectedIds: [],
  });
}

const timeLabel = (t: number) => new Date(t).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** Make an old version the current document. The current state is saved first, so this is reversible. */
export async function restoreVersion(id: string) {
  const meta = st().versions.find((v) => v.id === id);
  const doc = await loadVersion(id);
  if (!meta || !doc) {
    st().showToast("That version is no longer available");
    return;
  }
  const activeBefore = st().preview?.saved.activePageId ?? st().activePageId;
  exitPreview();
  await snapshotNow("safety", { reason: `Before restoring ${meta.label ? `“${meta.label}”` : timeLabel(meta.created)}`, force: true });
  st().loadDocument({
    type: "sketchboard",
    version: 2,
    pages: doc.pages,
    activePageId: doc.pages.some((p) => p.id === activeBefore) ? activeBefore : doc.activePageId,
    canvasBg: doc.canvasBg,
  });
  st().showToast(`Restored version from ${timeLabel(meta.created)}`);
}

/** Bring the page being previewed into the current document as a new page. */
export function copyPreviewPageToCurrent() {
  const s = st();
  if (!s.preview) return;
  const meta = s.versions.find((v) => v.id === s.preview!.versionId);
  const page = s.pages.find((p) => p.id === s.activePageId);
  const source = s.elements;
  const sourcePageId = s.activePageId;
  exitPreview();
  const name = `${page?.name ?? "Page"} (${meta ? timeLabel(meta.created) : "old version"})`;
  st().addPage();
  const created = useStore.getState();
  created.renamePage(created.activePageId, name);
  const elements = cloneElements(source, 0, 0, { pageMap: new Map([[sourcePageId, created.activePageId]]) });
  useStore.setState({ elements });
  st().showToast(`Copied into new page “${name}”`);
}

export async function renameVersion(id: string, label: string) {
  await api(`/api/versions/${id}`, { method: "PATCH", body: { label } }).catch(() => st().showToast("Couldn't rename that version"));
  await refresh();
}

export async function deleteVersion(id: string) {
  if (st().preview?.versionId === id) exitPreview();
  await api(`/api/versions/${id}`, { method: "DELETE" }).catch(() => st().showToast("Couldn't delete that version"));
  await refresh();
}

// ---- automatic snapshots ----

/** Start tracking history for a newly opened project. */
export async function initVersions(id: string) {
  projectId = id;
  changedSinceSnapshot = false;
  setVersions([]);
  await refresh();
  if (projectId === id && !st().versions.length) await snapshotNow("auto", { reason: "Starting point" });
}

export function closeVersions() {
  projectId = null;
  setVersions([]);
}

useStore.subscribe((s, prev) => {
  if (!projectId || !s.project || s.preview || prev.preview) return;
  if (s.elements !== prev.elements || s.pages !== prev.pages || s.canvasBg !== prev.canvasBg) changedSinceSnapshot = true;
});

window.setInterval(() => {
  if (projectId && changedSinceSnapshot && !st().preview && Date.now() - lastSnapshotAt >= AUTO_INTERVAL) snapshotNow("auto");
}, 30_000);

// leaving the tab is a natural checkpoint
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && projectId && changedSinceSnapshot && !st().preview && Date.now() - lastSnapshotAt >= MIN) snapshotNow("auto");
});

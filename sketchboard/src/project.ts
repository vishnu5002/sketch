// The open project: loading, auto-saving to the service (with an offline queue in
// this browser), live updates from other windows, and hash routing (#/ and #/p/<id>).
import { ApiError, OfflineError, clientId, projectsApi, subscribeEvents, type ProjectMeta, type ServerEvent } from "./api";
import { useStore, type Route } from "./store";
import type { DocumentFile, Page, SketchElement } from "./types";
import { idbDelete, idbGet, idbSet } from "./utils/db";
import { loadFonts } from "./utils/fonts";
import { externalizeImages } from "./utils/images";
import { thumbnail } from "./utils/thumbnail";
import { closeVersions, exitPreview, initVersions, realDocument, snapshotNow } from "./utils/versions";
import { zoomToFit } from "./actions";

const SAVE_DELAY = 700;
const THUMB_EVERY = 15_000;
const outboxKey = (id: string) => `outbox:${id}`;

interface Outbox {
  baseRev: number;
  doc: DocumentFile;
  at: number;
}

const st = () => useStore.getState();
const toast = (m: string) => st().showToast(m);

let saveTimer: number | undefined;
let retryTimer: number | undefined;
let retryDelay = 2000;
let saving: Promise<void> | null = null;
let again = false;
let lastThumbAt = 0;
let suppress = false; // store updates we make ourselves (image swaps, remote reloads) aren't edits
let opening = 0;

// ---------- routing ----------

export function routeFromHash(hash = location.hash): Route {
  const m = /^#\/p\/([\w-]{8,64})/.exec(hash);
  return m ? { name: "editor", id: m[1] } : { name: "home" };
}

export function navigate(route: Route) {
  const hash = route.name === "editor" ? `#/p/${route.id}` : "#/";
  if (location.hash !== hash) location.hash = hash;
  else applyRoute(route);
}

export const goHome = () => navigate({ name: "home" });
export const openInEditor = (id: string) => navigate({ name: "editor", id });

async function applyRoute(route: Route) {
  const cur = st().route;
  if (route.name === "editor" && cur.name === "editor" && cur.id === route.id && st().project?.id === route.id) return;
  if (st().project && (route.name === "home" || st().project!.id !== (route as { id: string }).id)) await closeProject();
  useStore.setState({ route });
  if (route.name === "editor") await openProject(route.id);
}

let routing = false;

export function startRouter() {
  if (routing) return;
  routing = true;
  window.addEventListener("hashchange", () => applyRoute(routeFromHash()));
  applyRoute(routeFromHash());
}

// ---------- open / close ----------

function applyDoc(doc: DocumentFile, keepView: boolean) {
  const s = st();
  const view = keepView ? { pageId: s.activePageId, viewport: s.viewport } : null;
  suppress = true;
  s.loadDocument({ ...doc, activePageId: view && doc.pages.some((p) => p.id === view.pageId) ? view.pageId : doc.activePageId });
  if (view && st().activePageId === view.pageId) useStore.setState({ viewport: view.viewport });
  suppress = false;
}

async function openProject(id: string) {
  const ticket = ++opening;
  useStore.setState({ project: null, saveStatus: "saved", showVersions: false, preview: null, viewMode: false });
  let p;
  try {
    p = await projectsApi.get(id);
  } catch (err) {
    if (ticket !== opening) return;
    if (err instanceof OfflineError) {
      // Home can't load either, so wait here for the service to come back.
      useStore.setState({ waitingForService: true });
      setTimeout(() => ticket === opening && openProject(id), 3000);
      return;
    }
    toast(err instanceof ApiError && err.status === 404 ? "That drawing doesn't exist (it may have been deleted)" : "Couldn't open that drawing");
    goHome();
    return;
  }
  useStore.setState({ waitingForService: false });
  const outbox = await idbGet<Outbox>(outboxKey(id)).catch(() => undefined);
  const doc = outbox?.doc ?? p.doc;
  await loadFonts(doc.pages.flatMap((pg) => pg.elements).map((e) => e.fontFamily));
  if (ticket !== opening) return;
  applyDoc(doc, false);
  useStore.setState({
    project: { id, name: p.name, rev: outbox?.baseRev ?? p.rev, linkedPath: p.linkedPath, fileState: p.fileState ?? "ok" },
    saveStatus: outbox ? "dirty" : "saved",
  });
  const page = st().pages.find((pg) => pg.id === st().activePageId);
  if (!page?.viewport && st().elements.length) requestAnimationFrame(() => zoomToFit());
  projectsApi.patch(id, { opened: true }).catch(() => undefined);
  initVersions(id);
  lastThumbAt = p.hasThumb ? Date.now() : 0;
  if (outbox) {
    toast("Restored changes that hadn't reached the service yet");
    scheduleSave(0);
  }
}

/** Finish pending saves (with a fresh thumbnail) before leaving a project. */
export async function closeProject() {
  const p = st().project;
  if (!p) return;
  ++opening;
  clearTimeout(saveTimer);
  saveTimer = undefined;
  if (st().preview) exitPreview();
  await flushSave({ thumb: true });
  closeVersions();
  useStore.setState({ project: null, saveStatus: "saved", showVersions: false, viewMode: false });
}

// ---------- saving ----------

function scheduleSave(delay = SAVE_DELAY) {
  clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    saveTimer = undefined;
    void runSave({});
  }, delay);
}

/** Save now and wait for it (and any save already running). */
export async function flushSave(opts: { thumb?: boolean } = {}) {
  clearTimeout(saveTimer);
  saveTimer = undefined;
  if (saving) await saving;
  if (st().saveStatus === "dirty" || st().saveStatus === "offline" || st().saveStatus === "error" || opts.thumb) await runSave(opts);
}

function swapImages(swaps: Map<string, string>) {
  if (!swaps.size) return;
  const fix = (els: SketchElement[]) => (els.some((e) => e.src && swaps.has(e.src)) ? els.map((e) => (e.src && swaps.has(e.src) ? { ...e, src: swaps.get(e.src) } : e)) : els);
  suppress = true;
  useStore.setState((s) => ({ elements: fix(s.elements), pages: s.pages.map((pg: Page) => ({ ...pg, elements: fix(pg.elements) })) }));
  suppress = false;
}

function runSave(opts: { thumb?: boolean; force?: boolean }): Promise<void> {
  if (saving) {
    again = true;
    return saving;
  }
  saving = (async () => {
    const p = st().project;
    if (!p || (st().saveStatus === "conflict" && !opts.force)) return;
    useStore.setState({ saveStatus: "saving" });
    const doc = realDocument();
    try {
      const { doc: clean, swaps } = await externalizeImages(doc);
      swapImages(swaps);
      const wantThumb = opts.thumb || Date.now() - lastThumbAt > THUMB_EVERY;
      const thumb = wantThumb ? await thumbnail(clean) : undefined;
      const { rev } = await projectsApi.save(p.id, { baseRev: p.rev, doc: clean, thumb, force: opts.force });
      if (wantThumb) lastThumbAt = Date.now();
      const cur = st().project;
      if (cur?.id === p.id) useStore.setState({ project: { ...cur, rev }, saveStatus: again || saveTimer ? "dirty" : "saved" });
      retryDelay = 2000;
      idbDelete(outboxKey(p.id)).catch(() => undefined);
    } catch (err) {
      if (st().project?.id !== p.id) return;
      if (err instanceof ApiError && err.status === 409) {
        useStore.setState({ saveStatus: "conflict" });
      } else if (err instanceof ApiError && err.status === 404) {
        useStore.setState({ saveStatus: "error" });
        toast("This drawing was deleted for good in another window, so these changes can't be saved");
      } else if (err instanceof OfflineError) {
        // Keep the latest state in this browser and retry with backoff.
        await idbSet(outboxKey(p.id), { baseRev: p.rev, doc, at: Date.now() } satisfies Outbox).catch(() => undefined);
        useStore.setState({ saveStatus: "offline" });
        clearTimeout(retryTimer);
        retryTimer = window.setTimeout(() => void runSave({}), retryDelay);
        retryDelay = Math.min(30_000, retryDelay * 2);
      } else {
        useStore.setState({ saveStatus: "error" });
        toast(err instanceof ApiError ? `Couldn't save: ${err.message}` : "Couldn't save");
      }
    }
  })().finally(() => {
    saving = null;
    if (again) {
      again = false;
      void runSave({});
    }
  });
  return saving;
}

/** Ctrl+S: everything auto-saves, so this saves now and marks a checkpoint in history. */
export async function saveCheckpoint() {
  if (!st().project) return;
  if (st().preview) {
    toast("You're previewing an old version — restore it or go back first");
    return;
  }
  await flushSave();
  const v = await snapshotNow("save", { reason: "Saved with Ctrl+S" });
  toast(st().saveStatus === "offline" ? "Saved in this browser — it will reach the service when it's back" : v ? "Saved · checkpoint added to version history" : "Saved");
}

// ---------- conflicts ----------

/** Another window saved first. Keep mine overwrites; Use theirs reloads, keeping mine as a version. */
export async function resolveConflict(choice: "mine" | "theirs") {
  const p = st().project;
  if (!p) return;
  if (choice === "mine") {
    useStore.setState({ saveStatus: "dirty" });
    await runSave({ force: true });
    toast("Kept your version");
    return;
  }
  await snapshotNow("safety", { reason: "Your version before taking the other window's changes", force: true });
  const fresh = await projectsApi.get(p.id);
  applyDoc(fresh.doc, true);
  useStore.setState({ project: { ...p, rev: fresh.rev }, saveStatus: "saved" });
  toast("Loaded the latest version — yours is in version history");
}

export async function resolveFileChange(action: "reload" | "keep") {
  const p = st().project;
  if (!p) return;
  await flushSave();
  const { rev } = await projectsApi.resolveFile(p.id, action);
  if (action === "reload") {
    const fresh = await projectsApi.get(p.id);
    applyDoc(fresh.doc, true);
  }
  useStore.setState({ project: { ...st().project!, rev, fileState: "ok" }, saveStatus: "saved" });
  toast(action === "reload" ? "Reloaded from the file — your previous state is in version history" : "Kept your version and rewrote the file");
}

export async function renameProject(name: string) {
  const p = st().project;
  if (!p || !name.trim() || name.trim() === p.name) return;
  const meta = await projectsApi.patch(p.id, { name });
  useStore.setState({ project: { ...st().project!, name: meta.name } });
}

export function setLinked(meta: ProjectMeta) {
  const p = st().project;
  if (p?.id === meta.id) useStore.setState({ project: { ...p, linkedPath: meta.linkedPath, fileState: meta.fileState ?? "ok", rev: meta.rev } });
}

// ---------- create ----------

export async function createAndOpen(name: string, doc?: DocumentFile) {
  const meta = await projectsApi.create({ name, doc });
  openInEditor(meta.id);
  return meta;
}

// ---------- change tracking ----------

useStore.subscribe((s, prev) => {
  if (suppress || !s.project || s.preview || prev.preview || s.project.id !== prev.project?.id) return;
  const edited = s.elements !== prev.elements || s.pages !== prev.pages || s.canvasBg !== prev.canvasBg || s.activePageId !== prev.activePageId;
  const moved = s.viewport !== prev.viewport;
  if (!edited && !moved) return;
  if (s.saveStatus === "conflict") return;
  if (s.saveStatus === "saved") useStore.setState({ saveStatus: "dirty" });
  scheduleSave(edited ? SAVE_DELAY : 1500);
});

let unsubscribe: (() => void) | null = null;
const listeners = new Set<(e: ServerEvent) => void>();

/** Hear about every change on the server (Home uses this to refresh). */
export function onServerEvent(fn: (e: ServerEvent) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** React to saves from other windows and to linked files changing on disk. */
export function startLiveUpdates() {
  unsubscribe?.();
  unsubscribe = subscribeEvents(async (e) => {
    listeners.forEach((fn) => fn(e));
    const p = st().project;
    if (!p || e.id !== p.id) return;
    if (e.type === "file") {
      useStore.setState({ project: { ...p, fileState: e.state } });
      return;
    }
    if (e.type !== "project" || e.origin === clientId || e.rev <= p.rev) return;
    // Only the viewport moved over there: keep our view, just catch up on the revision.
    if (e.changed === false && !saving) {
      useStore.setState({ project: { ...p, rev: e.rev } });
      return;
    }
    // Someone else saved. With nothing pending here, follow along; otherwise the
    // next save reports the conflict.
    if (st().saveStatus !== "saved" || saving || st().preview) return;
    try {
      const fresh = await projectsApi.get(p.id);
      if (st().saveStatus !== "saved" || st().project?.id !== p.id) return;
      applyDoc(fresh.doc, true);
      useStore.setState({ project: { ...st().project!, rev: fresh.rev, name: fresh.name } });
    } catch {
      // will catch up on the next save
    }
  });
}

window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && st().project) void flushSave();
});

window.addEventListener("beforeunload", (e) => {
  const status = st().saveStatus;
  if (st().project && (status === "dirty" || status === "saving" || status === "offline" || status === "conflict")) {
    // Last-chance copy in this browser; restored next time the project opens.
    const p = st().project!;
    idbSet(outboxKey(p.id), { baseRev: p.rev, doc: realDocument(), at: Date.now() } satisfies Outbox).catch(() => undefined);
    e.preventDefault();
  }
});

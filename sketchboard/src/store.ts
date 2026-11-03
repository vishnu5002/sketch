import { create } from "zustand";
import { nanoid } from "nanoid";
import type {
  DocumentFile,
  LibraryItem,
  Page,
  Point,
  SketchElement,
  Style,
  Theme,
  ToolType,
  Viewport,
} from "./types";
import { cleanupReferences, refreshBindings } from "./utils/binding";
import { cloneElements } from "./utils/clone";
import { assignFrames, frameChildren } from "./utils/frames";
import { getCommonBounds } from "./utils/geometry";
import { libraryApi, settingsApi, type FileState } from "./api";
import { CONTAINER_PADDING, containerTextHeight, isTextContainer, measureText } from "./utils/renderer";
import { DEFAULT_FONT, QUICK_FONTS, isLegacyFamily, loadFonts, onFontLoaded, registerBundledFonts, resolveFamily } from "./utils/fonts";

const HISTORY_LIMIT = 200;
const THEME_KEY = "sketchboard.theme";
const DEFAULT_VIEWPORT: Viewport = { scrollX: 0, scrollY: 0, zoom: 1 };

export const DEFAULT_STYLE: Style = {
  strokeColor: "#1e1e1e",
  backgroundColor: "transparent",
  fillStyle: "hachure",
  strokeWidth: 2,
  strokeStyle: "solid",
  roughness: 1,
  roundness: true,
  opacity: 100,
  fontFamily: DEFAULT_FONT,
  fontSize: 20,
  textAlign: "left",
  fontWeight: "normal",
  fontStyle: "normal",
  textDecoration: "none",
  lineType: "straight",
  startArrowhead: "none",
  endArrowhead: "arrow",
};

export interface HistoryEntry {
  elements: SketchElement[];
  selectedIds: string[];
}

export function snapshot(elements: SketchElement[], selectedIds: string[]): HistoryEntry {
  return { elements: elements.map((e) => ({ ...e })), selectedIds: [...selectedIds] };
}

export interface ContextMenuState {
  x: number;
  y: number;
  scene: Point;
  targetId: string | null;
}

export interface LinkEditorState {
  elementId: string;
  mode: "link" | "embed";
  isNew?: boolean;
}

interface UIState {
  showStats: boolean;
  showMinimap: boolean;
  showLibrary: boolean;
  searchOpen: boolean;
  exportOpen: boolean;
  templatesOpen: boolean;
  helpOpen: boolean;
  contextMenu: ContextMenuState | null;
  linkEditor: LinkEditorState | null;
  activeEmbedId: string | null;
  editingFrameId: string | null;
  /** Read-only presenting/browsing mode: pan, follow links, use embeds — no edits. */
  viewMode: boolean;
  viewTool: "pan" | "laser";
  route: Route;
  /** The project open in the editor. */
  project: OpenProject | null;
  saveStatus: SaveStatus;
  /** Opening a project is on hold until the service answers again. */
  waitingForService: boolean;
  /** Project whose "Link to file" dialog is open. */
  linkDialogFor: string | null;
  showVersions: boolean;
  versions: VersionMeta[];
  preview: PreviewState | null;
}

export type Route = { name: "home" } | { name: "editor"; id: string };

export interface OpenProject {
  id: string;
  name: string;
  rev: number;
  linkedPath: string | null;
  fileState: FileState;
}

/** dirty = waiting to save · offline = kept in this browser until the service is back · conflict = changed elsewhere */
export type SaveStatus = "saved" | "dirty" | "saving" | "offline" | "conflict" | "error";

export type VersionKind = "auto" | "named" | "save" | "safety";

export interface VersionMeta {
  id: string;
  created: number;
  kind: VersionKind;
  label?: string;
  reason?: string;
  summary: string;
  pageCount: number;
  elementCount: number;
  /** URL of a small preview image */
  thumb?: string;
  hash: string;
}

/** While previewing an old version, the real document is parked here untouched. */
export interface PreviewState {
  versionId: string;
  saved: { pages: Page[]; activePageId: string; viewMode: boolean; canvasBg: string };
}

/** Preferences kept on the server, shared by every project. */
interface Settings {
  theme: Theme;
  style: Style;
  recentColors: string[];
  gridEnabled: boolean;
  snapEnabled: boolean;
  showMinimap: boolean;
  showStats: boolean;
}

interface AppState extends UIState {
  hydrated: boolean;
  elements: SketchElement[];
  selectedIds: string[];
  tool: ToolType;
  lockTool: boolean;
  style: Style;
  viewport: Viewport;
  theme: Theme;
  gridEnabled: boolean;
  snapEnabled: boolean;
  editingTextId: string | null;
  canvasBg: string;
  recentColors: string[];
  pages: Page[];
  activePageId: string;
  library: LibraryItem[];
  toast: { id: number; message: string } | null;
  past: HistoryEntry[];
  future: HistoryEntry[];

  hydrate: () => Promise<void>;
  setUI: (patch: Partial<UIState>) => void;
  toggleViewMode: () => void;
  showToast: (message: string) => void;

  setTool: (t: ToolType) => void;
  toggleLockTool: () => void;
  setStyle: (patch: Partial<Style>) => void;
  patchSelected: (patch: Partial<SketchElement>) => void;
  setViewport: (patch: Partial<Viewport>) => void;
  toggleTheme: () => void;
  toggleGrid: () => void;
  toggleSnap: () => void;
  setCanvasBg: (c: string) => void;
  pushRecentColor: (c: string) => void;

  addElement: (el: SketchElement) => void;
  updateElement: (id: string, patch: Partial<SketchElement>) => void;
  updateElements: (patches: { id: string; patch: Partial<SketchElement> }[]) => void;
  replaceElements: (els: SketchElement[]) => void;
  insertElements: (els: SketchElement[]) => void;
  deleteElements: (ids: string[]) => void;
  removeElementsNoHistory: (ids: string[]) => void;
  duplicateSelected: () => void;

  setSelectedIds: (ids: string[]) => void;
  selectAll: () => void;

  bringToFront: (ids: string[]) => void;
  bringForward: (ids: string[]) => void;
  sendBackward: (ids: string[]) => void;
  sendToBack: (ids: string[]) => void;
  groupSelected: () => void;
  ungroupSelected: () => void;
  toggleLock: (ids: string[]) => void;
  unlockAll: () => void;
  setLink: (id: string, link: string | null) => void;
  flipSelected: (axis: "x" | "y") => void;

  commitSnapshot: (entry: HistoryEntry) => void;
  undo: () => void;
  redo: () => void;

  clearCanvas: () => void;
  loadDocument: (doc: DocumentFile | { elements: SketchElement[] }) => void;
  getDocument: () => DocumentFile;

  addPage: () => void;
  switchPage: (id: string) => void;
  renamePage: (id: string, name: string) => void;
  deletePage: (id: string) => void;
  duplicatePage: (id: string) => void;

  addLibraryItem: (els: SketchElement[], name?: string) => void;
  removeLibraryItem: (id: string) => void;
  renameLibraryItem: (id: string, name: string) => void;
  importLibrary: (items: LibraryItem[]) => void;

  setEditingTextId: (id: string | null) => void;
}

// Consecutive tweaks of the same kind (dragging an opacity slider, typing in a
// stats field) collapse into one undo step instead of one per input event.
let lastMergeKey = "";
let lastMergeTime = 0;
function pushHistory(s: AppState, mergeKey = ""): HistoryEntry[] {
  const now = Date.now();
  if (mergeKey && mergeKey === lastMergeKey && now - lastMergeTime < 800) {
    lastMergeTime = now;
    return s.past;
  }
  lastMergeKey = mergeKey;
  lastMergeTime = now;
  return [...s.past, snapshot(s.elements, s.selectedIds)].slice(-HISTORY_LIMIT);
}

/** Keep text boxes sized to their content after font/text changes. */
export function refit(el: SketchElement): SketchElement {
  if (el.type === "text") {
    const m = measureText(el.text || " ", el);
    return { ...el, width: m.width, height: m.height };
  }
  if (isTextContainer(el) && el.text) {
    const need = containerTextHeight(el) + CONTAINER_PADDING * 2;
    if (need > el.height) return { ...el, height: need };
  }
  return el;
}

function syncedPages(s: AppState): Page[] {
  return s.pages.map((p) => (p.id === s.activePageId ? { ...p, elements: s.elements, viewport: s.viewport } : p));
}

function switchTo(pages: Page[], id: string): Partial<AppState> {
  const target = pages.find((p) => p.id === id) ?? pages[0];
  return {
    pages,
    activePageId: target.id,
    elements: target.elements,
    viewport: target.viewport ?? DEFAULT_VIEWPORT,
    selectedIds: [],
    past: [],
    future: [],
    editingTextId: null,
    activeEmbedId: null,
    linkEditor: null,
    contextMenu: null,
  };
}

function initialTheme(): Theme {
  try {
    return localStorage.getItem(THEME_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

let hydrating: Promise<void> | null = null;
const firstPageId = nanoid();

export const useStore = create<AppState>()((set, get) => ({
  hydrated: false,
  elements: [],
  selectedIds: [],
  tool: "selection",
  lockTool: false,
  style: DEFAULT_STYLE,
  viewport: DEFAULT_VIEWPORT,
  theme: initialTheme(),
  gridEnabled: false,
  snapEnabled: true,
  editingTextId: null,
  canvasBg: "#ffffff",
  recentColors: [],
  pages: [{ id: firstPageId, name: "Page 1", elements: [] }],
  activePageId: firstPageId,
  library: [],
  toast: null,
  past: [],
  future: [],

  showStats: false,
  showMinimap: false,
  showLibrary: false,
  searchOpen: false,
  exportOpen: false,
  templatesOpen: false,
  helpOpen: false,
  contextMenu: null,
  linkEditor: null,
  activeEmbedId: null,
  editingFrameId: null,
  viewMode: false,
  viewTool: "pan",
  route: { name: "home" },
  project: null,
  saveStatus: "saved",
  waitingForService: false,
  linkDialogFor: null,
  showVersions: false,
  versions: [],
  preview: null,

  // Concurrent callers share one load, and a failed load can be retried.
  hydrate: () => {
    hydrating ??= loadPreferences().catch((err) => {
      hydrating = null;
      throw err;
    });
    return hydrating;
  },

  setUI: (patch) => set(patch),
  toggleViewMode: () =>
    set((s) => ({
      viewMode: !s.viewMode,
      viewTool: "pan",
      selectedIds: [],
      editingTextId: null,
      editingFrameId: null,
      activeEmbedId: null,
      contextMenu: null,
      linkEditor: null,
      showLibrary: false,
    })),
  showToast: (message) => set({ toast: { id: Date.now() + Math.random(), message } }),

  setTool: (t) => set({ tool: t, activeEmbedId: null }),
  toggleLockTool: () => set((s) => ({ lockTool: !s.lockTool })),
  setStyle: (patch) =>
    set((s) => {
      const style = { ...s.style, ...patch };
      if (s.selectedIds.length === 0) return { style };
      const ids = new Set(s.selectedIds);
      const past = pushHistory(s, "style:" + Object.keys(patch).join(",") + ":" + s.selectedIds.join(","));
      const elements = s.elements.map((e) => (ids.has(e.id) ? refit({ ...e, ...(patch as Partial<SketchElement>) }) : e));
      return { style, elements: refreshBindings(elements, ids), past, future: [] };
    }),
  patchSelected: (patch) =>
    set((s) => {
      if (s.selectedIds.length === 0) return s;
      const ids = new Set(s.selectedIds);
      const past = pushHistory(s, "patch:" + Object.keys(patch).join(",") + ":" + s.selectedIds.join(","));
      const elements = s.elements.map((e) => (ids.has(e.id) ? refit({ ...e, ...patch }) : e));
      return { elements: refreshBindings(elements, ids), past, future: [] };
    }),
  setViewport: (patch) => set((s) => ({ viewport: { ...s.viewport, ...patch } })),
  toggleTheme: () =>
    set((s) => {
      const theme: Theme = s.theme === "light" ? "dark" : "light";
      try {
        localStorage.setItem(THEME_KEY, theme);
      } catch {
        // non-essential
      }
      return { theme };
    }),
  toggleGrid: () => set((s) => ({ gridEnabled: !s.gridEnabled })),
  toggleSnap: () => set((s) => ({ snapEnabled: !s.snapEnabled })),
  setCanvasBg: (c) => set({ canvasBg: c }),
  pushRecentColor: (c) =>
    set((s) => ({ recentColors: [c, ...s.recentColors.filter((x) => x.toLowerCase() !== c.toLowerCase())].slice(0, 8) })),

  addElement: (el) => set((s) => ({ elements: [...s.elements, el] })),
  updateElement: (id, patch) =>
    set((s) => {
      const elements = s.elements.map((e) => (e.id === id ? { ...e, ...patch } : e));
      return { elements: refreshBindings(elements, new Set([id])) };
    }),
  updateElements: (patches) =>
    set((s) => {
      const map = new Map(patches.map((p) => [p.id, p.patch]));
      const elements = s.elements.map((e) => (map.has(e.id) ? { ...e, ...map.get(e.id) } : e));
      return { elements: refreshBindings(elements, new Set(map.keys())) };
    }),
  replaceElements: (els) => set({ elements: els }),
  insertElements: (els) =>
    set((s) => {
      if (els.length === 0) return s;
      const past = pushHistory(s);
      const ids = new Set(els.map((e) => e.id));
      let elements = assignFrames([...s.elements, ...els], ids);
      elements = refreshBindings(elements, ids);
      return { elements, selectedIds: els.filter((e) => !e.frameId || !ids.has(e.frameId)).map((e) => e.id), past, future: [] };
    }),
  deleteElements: (ids) =>
    set((s) => {
      if (ids.length === 0) return s;
      const idSet = new Set(ids);
      const past = pushHistory(s);
      const elements = cleanupReferences(s.elements.filter((e) => !idSet.has(e.id)));
      return { elements, selectedIds: s.selectedIds.filter((id) => !idSet.has(id)), past, future: [] };
    }),
  removeElementsNoHistory: (ids) =>
    set((s) => {
      const idSet = new Set(ids);
      return {
        elements: cleanupReferences(s.elements.filter((e) => !idSet.has(e.id))),
        selectedIds: s.selectedIds.filter((id) => !idSet.has(id)),
      };
    }),
  duplicateSelected: () => {
    const s = get();
    if (s.selectedIds.length === 0) return;
    const ids = new Set(s.selectedIds);
    const frameIds = new Set(s.elements.filter((e) => ids.has(e.id) && e.type === "frame").map((e) => e.id));
    frameChildren(s.elements, frameIds).forEach((c) => ids.add(c.id));
    const copies = cloneElements(
      s.elements.filter((e) => ids.has(e.id)),
      10,
      10,
    );
    get().insertElements(copies);
  },

  setSelectedIds: (ids) => set({ selectedIds: ids }),
  selectAll: () => set((s) => ({ selectedIds: s.elements.filter((e) => !e.locked).map((e) => e.id) })),

  bringToFront: (ids) =>
    set((s) => {
      const idSet = new Set(ids);
      return { elements: [...s.elements.filter((e) => !idSet.has(e.id)), ...s.elements.filter((e) => idSet.has(e.id))], past: pushHistory(s), future: [] };
    }),
  sendToBack: (ids) =>
    set((s) => {
      const idSet = new Set(ids);
      return { elements: [...s.elements.filter((e) => idSet.has(e.id)), ...s.elements.filter((e) => !idSet.has(e.id))], past: pushHistory(s), future: [] };
    }),
  bringForward: (ids) =>
    set((s) => {
      const idSet = new Set(ids);
      const arr = [...s.elements];
      for (let i = arr.length - 2; i >= 0; i--) {
        if (idSet.has(arr[i].id) && !idSet.has(arr[i + 1].id)) [arr[i], arr[i + 1]] = [arr[i + 1], arr[i]];
      }
      return { elements: arr, past: pushHistory(s), future: [] };
    }),
  sendBackward: (ids) =>
    set((s) => {
      const idSet = new Set(ids);
      const arr = [...s.elements];
      for (let i = 1; i < arr.length; i++) {
        if (idSet.has(arr[i].id) && !idSet.has(arr[i - 1].id)) [arr[i], arr[i - 1]] = [arr[i - 1], arr[i]];
      }
      return { elements: arr, past: pushHistory(s), future: [] };
    }),
  groupSelected: () =>
    set((s) => {
      if (s.selectedIds.length < 2) return s;
      const groupId = nanoid();
      const idSet = new Set(s.selectedIds);
      return { elements: s.elements.map((e) => (idSet.has(e.id) ? { ...e, groupId } : e)), past: pushHistory(s), future: [] };
    }),
  ungroupSelected: () =>
    set((s) => {
      const idSet = new Set(s.selectedIds);
      return { elements: s.elements.map((e) => (idSet.has(e.id) ? { ...e, groupId: null } : e)), past: pushHistory(s), future: [] };
    }),
  toggleLock: (ids) =>
    set((s) => {
      if (ids.length === 0) return s;
      const idSet = new Set(ids);
      const targets = s.elements.filter((e) => idSet.has(e.id));
      const lock = !targets.every((e) => e.locked);
      return {
        elements: s.elements.map((e) => (idSet.has(e.id) ? { ...e, locked: lock } : e)),
        selectedIds: lock ? s.selectedIds.filter((id) => !idSet.has(id)) : s.selectedIds,
        past: pushHistory(s),
        future: [],
      };
    }),
  unlockAll: () =>
    set((s) => ({ elements: s.elements.map((e) => (e.locked ? { ...e, locked: false } : e)), past: pushHistory(s), future: [] })),
  setLink: (id, link) =>
    set((s) => ({ elements: s.elements.map((e) => (e.id === id ? { ...e, link } : e)), past: pushHistory(s), future: [] })),
  flipSelected: (axis) =>
    set((s) => {
      const ids = new Set(s.selectedIds);
      const sel = s.elements.filter((e) => ids.has(e.id));
      const b = getCommonBounds(sel);
      if (!b) return s;
      const cx = (b.x1 + b.x2) / 2;
      const cy = (b.y1 + b.y2) / 2;
      const elements = s.elements.map((e) => {
        if (!ids.has(e.id)) return e;
        const next: SketchElement = { ...e, angle: -e.angle };
        if (axis === "x") next.x = 2 * cx - (e.x + e.width);
        else next.y = 2 * cy - (e.y + e.height);
        if (e.points) next.points = e.points.map(([px, py]) => (axis === "x" ? [e.width - px, py] : [px, e.height - py]));
        if (e.type === "image") {
          if (axis === "x") next.flipX = !e.flipX;
          else next.flipY = !e.flipY;
        }
        if (e.type === "arrow") {
          if (e.startBinding && !ids.has(e.startBinding.elementId)) next.startBinding = null;
          if (e.endBinding && !ids.has(e.endBinding.elementId)) next.endBinding = null;
        }
        return next;
      });
      return { elements: refreshBindings(elements, ids), past: pushHistory(s), future: [] };
    }),

  commitSnapshot: (entry) => {
    lastMergeKey = "";
    set((s) => ({ past: [...s.past, entry].slice(-HISTORY_LIMIT), future: [] }));
  },
  undo: () =>
    set((s) => {
      if (s.past.length === 0) return s;
      lastMergeKey = "";
      const prev = s.past[s.past.length - 1];
      return {
        elements: prev.elements,
        selectedIds: prev.selectedIds,
        past: s.past.slice(0, -1),
        future: [snapshot(s.elements, s.selectedIds), ...s.future].slice(0, HISTORY_LIMIT),
      };
    }),
  redo: () =>
    set((s) => {
      if (s.future.length === 0) return s;
      lastMergeKey = "";
      const next = s.future[0];
      return {
        elements: next.elements,
        selectedIds: next.selectedIds,
        past: [...s.past, snapshot(s.elements, s.selectedIds)].slice(-HISTORY_LIMIT),
        future: s.future.slice(1),
      };
    }),

  clearCanvas: () => set((s) => ({ elements: [], selectedIds: [], past: pushHistory(s), future: [] })),
  loadDocument: (doc) =>
    set((s) => {
      if ("pages" in doc) {
        // Files may come from elsewhere (hand-edited, generated, other machines'
        // fonts), so re-measure text against the fonts actually available here.
        const pages = doc.pages.map((p) => ({
          ...p,
          elements: refreshBindings(assignFrames((p.elements ?? []).map((e) => (e.text ? refit(e) : e)))),
        }));
        return { ...switchTo(pages, doc.activePageId), canvasBg: doc.canvasBg ?? s.canvasBg };
      }
      return { elements: doc.elements, selectedIds: [], past: pushHistory(s), future: [] };
    }),
  getDocument: () => {
    const s = get();
    return { type: "sketchboard", version: 2, pages: syncedPages(s), activePageId: s.activePageId, canvasBg: s.canvasBg };
  },

  addPage: () =>
    set((s) => {
      const pages = syncedPages(s);
      let n = pages.length + 1;
      while (pages.some((p) => p.name === `Page ${n}`)) n++;
      const page: Page = { id: nanoid(), name: `Page ${n}`, elements: [] };
      return switchTo([...pages, page], page.id);
    }),
  switchPage: (id) => set((s) => (id === s.activePageId ? s : switchTo(syncedPages(s), id))),
  renamePage: (id, name) => set((s) => ({ pages: s.pages.map((p) => (p.id === id ? { ...p, name: name.trim() || p.name } : p)) })),
  deletePage: (id) =>
    set((s) => {
      if (s.pages.length <= 1) return s;
      const pages = syncedPages(s);
      const idx = pages.findIndex((p) => p.id === id);
      const remaining = pages.filter((p) => p.id !== id);
      if (id !== s.activePageId) return { pages: remaining };
      return switchTo(remaining, remaining[Math.max(0, idx - 1)].id);
    }),
  duplicatePage: (id) =>
    set((s) => {
      const pages = syncedPages(s);
      const src = pages.find((p) => p.id === id);
      if (!src) return s;
      const copy: Page = { id: nanoid(), name: `${src.name} copy`, elements: cloneElements(src.elements), viewport: src.viewport };
      const idx = pages.indexOf(src);
      return switchTo([...pages.slice(0, idx + 1), copy, ...pages.slice(idx + 1)], copy.id);
    }),

  addLibraryItem: (els, name) =>
    set((s) => {
      const b = getCommonBounds(els);
      if (!b) return s;
      const item: LibraryItem = {
        id: nanoid(),
        name: name ?? `Item ${s.library.length + 1}`,
        elements: cloneElements(els, -b.x1, -b.y1),
        created: Date.now(),
      };
      return { library: [item, ...s.library] };
    }),
  removeLibraryItem: (id) => set((s) => ({ library: s.library.filter((i) => i.id !== id) })),
  renameLibraryItem: (id, name) => set((s) => ({ library: s.library.map((i) => (i.id === id ? { ...i, name } : i)) })),
  importLibrary: (items) =>
    set((s) => ({
      library: [...items.filter((i) => Array.isArray(i.elements)).map((i) => ({ ...i, id: nanoid(), created: i.created ?? Date.now() })), ...s.library],
    })),

  setEditingTextId: (id) => set({ editingTextId: id }),
}));

/** Preferences and the library, from the service. */
async function loadPreferences() {
  registerBundledFonts();
  const [settings, library] = await Promise.all([settingsApi.get() as Promise<Partial<Settings>>, libraryApi.get()]);
  const s = useStore.getState();
  const style = { ...DEFAULT_STYLE, ...(settings.style ?? {}) };
  // Existing drawings keep their look, but new text picks up the new default font.
  if (isLegacyFamily(style.fontFamily)) style.fontFamily = DEFAULT_FONT;
  await loadFonts([DEFAULT_FONT, ...QUICK_FONTS, style.fontFamily]);
  useStore.setState({
    hydrated: true,
    theme: settings.theme ?? s.theme,
    style,
    recentColors: settings.recentColors ?? [],
    gridEnabled: settings.gridEnabled ?? false,
    snapEnabled: settings.snapEnabled ?? true,
    showMinimap: settings.showMinimap ?? false,
    showStats: settings.showStats ?? false,
    library: library ?? [],
  });
}

// Text boxes measured before their webfont arrived are sized for fallback
// glyphs; re-measure them once the real font is available.
onFontLoaded((family) => {
  const refitIn = (els: SketchElement[]) => {
    let changed = false;
    const out = els.map((e) => {
      if (!e.text || resolveFamily(e.fontFamily) !== family) return e;
      const next = refit(e);
      if (next.width !== e.width || next.height !== e.height) changed = true;
      return next;
    });
    return changed ? out : els;
  };
  useStore.setState((s) => ({ elements: refitIn(s.elements), pages: s.pages.map((p) => ({ ...p, elements: refitIn(p.elements) })) }));
});

// ---- preferences & library (debounced, saved to the service) ----

let settingsTimer: number | undefined;
let libraryTimer: number | undefined;

function settingsOf(s: AppState): Settings {
  return {
    theme: s.theme,
    style: s.style,
    recentColors: s.recentColors,
    gridEnabled: s.gridEnabled,
    snapEnabled: s.snapEnabled,
    showMinimap: s.showMinimap,
    showStats: s.showStats,
  };
}

const saveSettingsNow = () => settingsApi.patch({ ...settingsOf(useStore.getState()) }).catch(() => undefined);

useStore.subscribe((s, prev) => {
  if (!s.hydrated || !prev.hydrated) return;
  const keys = ["theme", "style", "recentColors", "gridEnabled", "snapEnabled", "showMinimap", "showStats"] as const;
  if (keys.some((k) => s[k] !== prev[k])) {
    clearTimeout(settingsTimer);
    settingsTimer = window.setTimeout(saveSettingsNow, 400);
  }
  if (s.library !== prev.library) {
    clearTimeout(libraryTimer);
    libraryTimer = window.setTimeout(() => libraryApi.put(useStore.getState().library).catch(() => useStore.getState().showToast("Couldn't save the library — is the service running?")), 400);
  }
});

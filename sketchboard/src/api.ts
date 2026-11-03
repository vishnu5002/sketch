// Client for the local service's /api. Every call carries X-Sketchboard, which the
// server requires so other websites can't drive it.
import type { DocumentFile, LibraryItem } from "./types";

export interface ProjectMeta {
  id: string;
  name: string;
  created: number;
  updated: number;
  opened: number | null;
  pinned: boolean;
  deleted: number | null;
  hasThumb: boolean;
  pageCount: number;
  elementCount: number;
  linkedPath: string | null;
  sourcePath: string | null;
  rev: number;
  fileState?: FileState;
  /** Search hit context with [[ ]] around matches. */
  snippet?: string;
}

export type FileState = "ok" | "changed" | "missing" | "error";

export interface Project extends ProjectMeta {
  doc: DocumentFile;
}

export interface Folder {
  id: string;
  path: string;
  added: number;
}

export interface FolderFile {
  path: string;
  rel: string;
  name: string;
  size: number;
  mtime: number;
  projectId: string | null;
}

export interface BackupInfo {
  name: string;
  size: number;
  created: number;
  manual: boolean;
}

export interface Status {
  ok: boolean;
  dataDir: string;
  dbPath: string;
  backupsDir: string;
  counts: { projects: number; trash: number; versions: number; blobs: number };
}

export type ServerEvent =
  | { type: "project"; id: string; rev: number; origin: string | null; changed?: boolean }
  | { type: "meta"; id: string }
  | { type: "file"; id: string; state: FileState };

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, body: Record<string, unknown>) {
    super(typeof body.error === "string" ? body.error : `request failed (${status})`);
    this.status = status;
    this.body = body;
  }
}

/** Network-level failure: the service isn't reachable. */
export class OfflineError extends Error {
  constructor() {
    super("Can't reach the sketchboard service");
  }
}

/** Identifies this tab, so it can ignore change events caused by its own saves. */
export const clientId = crypto.randomUUID();

export async function api<T>(path: string, opts: { method?: string; body?: unknown; raw?: Blob; signal?: AbortSignal; keepalive?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { "X-Sketchboard": "1" };
  let body: BodyInit | undefined;
  if (opts.raw) {
    headers["Content-Type"] = opts.raw.type || "application/octet-stream";
    body = opts.raw;
  } else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(path, { method: opts.method ?? (body ? "POST" : "GET"), headers, body, signal: opts.signal, keepalive: opts.keepalive });
  } catch (err) {
    if ((err as DOMException)?.name === "AbortError") throw err;
    throw new OfflineError();
  }
  // A proxy or the dev server answering while the service is down.
  if (res.status === 502 || res.status === 503 || res.status === 504) throw new OfflineError();
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    throw new OfflineError();
  }
  if (!res.ok) throw new ApiError(res.status, (data ?? {}) as Record<string, unknown>);
  return data as T;
}

export const projectsApi = {
  list: (opts: { q?: string; trash?: boolean } = {}) => {
    const p = new URLSearchParams();
    if (opts.q) p.set("q", opts.q);
    if (opts.trash) p.set("trash", "1");
    return api<ProjectMeta[]>(`/api/projects${p.size ? `?${p}` : ""}`);
  },
  create: (body: { name?: string; doc?: DocumentFile }) => api<ProjectMeta>("/api/projects", { body }),
  get: (id: string) => api<Project>(`/api/projects/${id}`),
  save: (id: string, body: { baseRev: number; doc: DocumentFile; thumb?: string; force?: boolean }, keepalive = false) =>
    api<{ rev: number }>(`/api/projects/${id}`, { method: "PUT", body: { ...body, clientId }, keepalive }),
  patch: (id: string, body: { name?: string; pinned?: boolean; opened?: boolean; deleted?: boolean }) => api<ProjectMeta>(`/api/projects/${id}`, { method: "PATCH", body }),
  trash: (id: string) => api<ProjectMeta>(`/api/projects/${id}`, { method: "DELETE" }),
  purge: (id: string) => api<{ ok: true }>(`/api/projects/${id}?purge=1`, { method: "DELETE" }),
  duplicate: (id: string) => api<ProjectMeta>(`/api/projects/${id}/duplicate`, { method: "POST" }),
  import: (name: string, doc: unknown) => api<ProjectMeta>("/api/import", { body: { name, doc } }),
  link: (id: string, body: { folderId: string; fileName: string; overwrite?: boolean }) => api<ProjectMeta>(`/api/projects/${id}/link`, { body }),
  unlink: (id: string) => api<ProjectMeta>(`/api/projects/${id}/link`, { method: "DELETE" }),
  resolveFile: (id: string, action: "reload" | "keep") => api<{ rev: number }>(`/api/projects/${id}/link/resolve`, { body: { action } }),
  setThumb: (id: string, thumb: string) => api<{ ok: true }>(`/api/projects/${id}/thumb`, { method: "PUT", body: { thumb } }),
  thumbUrl: (m: ProjectMeta) => `/api/projects/${m.id}/thumb?v=${m.rev}-${m.hasThumb ? 1 : 0}`,
  exportUrl: (id: string) => `/api/projects/${id}/export`,
};

export const libraryApi = {
  get: () => api<LibraryItem[]>("/api/library"),
  put: (items: LibraryItem[]) => api<{ ok: true }>("/api/library", { method: "PUT", body: items }),
};

export const settingsApi = {
  get: () => api<Record<string, unknown>>("/api/settings"),
  patch: (patch: Record<string, unknown>) => api<Record<string, unknown>>("/api/settings", { method: "PATCH", body: patch }),
};

export const foldersApi = {
  list: () => api<Folder[]>("/api/folders"),
  add: (path: string) => api<Folder>("/api/folders", { body: { path } }),
  remove: (id: string) => api<{ ok: true }>(`/api/folders/${id}`, { method: "DELETE" }),
  scan: (id: string) => api<{ folder: Folder; truncated: boolean; files: FolderFile[] }>(`/api/folders/${id}/scan`),
  importFile: (id: string, rel: string, link: boolean) => api<ProjectMeta>(`/api/folders/${id}/import`, { body: { rel, link } }),
};

export const backupsApi = {
  list: () => api<{ dir: string; backups: BackupInfo[] }>("/api/backups"),
  now: () => api<{ path: string }>("/api/backups", { method: "POST" }),
};

export const statusApi = () => api<Status>("/api/status");

/** Server-sent change events, reconnecting automatically. */
export function subscribeEvents(fn: (e: ServerEvent) => void): () => void {
  const es = new EventSource("/api/events");
  es.onmessage = (m) => {
    try {
      fn(JSON.parse(m.data) as ServerEvent);
    } catch {
      // ignore malformed events
    }
  };
  return () => es.close();
}

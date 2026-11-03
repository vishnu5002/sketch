import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Archive,
  ArrowRight,
  Copy,
  Download,
  FilePlus2,
  FileText,
  FolderOpen,
  FolderPlus,
  HardDrive,
  Link2,
  Moon,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings,
  Star,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ApiError, backupsApi, foldersApi, projectsApi, statusApi, type BackupInfo, type Folder, type FolderFile, type ProjectMeta, type Status } from "../api";
import { createAndOpen, onServerEvent, openInEditor } from "../project";
import { useStore } from "../store";
import type { DocumentFile } from "../types";
import { exportJson, importFiles, openDocument } from "../utils/fileActions";
import { TEMPLATES } from "../utils/templates";
import { timeAgo } from "../utils/time";
import { thumbnail } from "../utils/thumbnail";
import { loadFonts } from "../utils/fonts";
import LinkFileDialog from "./LinkFileDialog";
import Thumbnail from "./Thumbnail";
import Toast from "./Toast";

const st = () => useStore.getState();
const toast = (m: string) => st().showToast(m);
const failed = (err: unknown) => toast(err instanceof ApiError ? err.message : "That didn't work — is the sketchboard service running?");

// Drawings imported from files have no preview until opened; render one in the background.
const thumbing = new Set<string>();
async function fillMissingThumbs(list: ProjectMeta[]) {
  for (const p of list) {
    if (p.hasThumb || !p.elementCount || thumbing.has(p.id)) continue;
    thumbing.add(p.id);
    try {
      const full = await projectsApi.get(p.id);
      await loadFonts(full.doc.pages.flatMap((pg) => pg.elements).map((e) => e.fontFamily));
      const t = await thumbnail(full.doc);
      if (t) await projectsApi.setThumb(p.id, t);
    } catch {
      // try again next visit
      thumbing.delete(p.id);
    }
  }
}

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
const fileOf = (path: string | null) => path?.split("/").pop() ?? "";

function Snippet({ text }: { text: string }) {
  const parts = text.replace(/\s+/g, " ").split(/(\[\[.*?\]\])/);
  return (
    <span className="snippet">
      {parts.map((p, i) => (p.startsWith("[[") ? <mark key={i}>{p.slice(2, -2)}</mark> : <span key={i}>{p}</span>))}
    </span>
  );
}

// ---------- project card ----------

const GAP = 6;
const EDGE = 8;

/** Where a menu of size `m` fits next to `a`: below if there's room, otherwise above, always inside the window. */
function placeMenu(a: DOMRect, m: DOMRect): { top: number; left: number } {
  const below = a.bottom + GAP;
  const above = a.top - GAP - m.height;
  const top = below + m.height <= innerHeight - EDGE || above < EDGE ? Math.min(below, innerHeight - EDGE - m.height) : above;
  return {
    top: Math.max(EDGE, Math.min(top, innerHeight - EDGE - m.height)),
    left: Math.max(EDGE, Math.min(a.right - m.width, innerWidth - EDGE - m.width)),
  };
}

function CardMenu({ p, anchor, onClose, onRename, reload }: { p: ProjectMeta; anchor: HTMLElement; onClose: () => void; onRename: () => void; reload: () => void }) {
  const ref = useRef<HTMLDivElement>(null);

  // Measure the rendered menu and place it before the first paint.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { top, left } = placeMenu(anchor.getBoundingClientRect(), el.getBoundingClientRect());
    Object.assign(el.style, { top: `${top}px`, left: `${left}px`, visibility: "visible" });
    el.querySelector<HTMLButtonElement>("button")?.focus({ preventScroll: true });
  }, [anchor]);

  useEffect(() => {
    // A fixed-position menu would drift away from its card, so close it instead.
    const close = () => onClose();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        anchor.focus();
      }
    };
    const scroller = document.querySelector(".home");
    scroller?.addEventListener("scroll", close, { passive: true });
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      scroller?.removeEventListener("scroll", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose, anchor]);

  const act = (fn: () => Promise<unknown> | void) => async () => {
    onClose();
    try {
      await fn();
      reload();
    } catch (err) {
      failed(err);
    }
  };
  return (
    <>
      <div className="menu-backdrop" onClick={onClose} />
      <div ref={ref} className="dropdown card-menu" role="menu" style={{ visibility: "hidden", top: 0, left: 0 }}>
        <button role="menuitem" onClick={act(() => openInEditor(p.id))}>
          <ArrowRight size={15} /> Open
        </button>
        <button role="menuitem" onClick={() => (onClose(), onRename())}>
          <Pencil size={15} /> Rename
        </button>
        <button role="menuitem" onClick={act(() => projectsApi.duplicate(p.id).then((m) => toast(`Created “${m.name}”`)))}>
          <Copy size={15} /> Duplicate
        </button>
        <button role="menuitem" onClick={act(() => projectsApi.patch(p.id, { pinned: !p.pinned }))}>
          <Star size={15} /> {p.pinned ? "Unpin" : "Pin to top"}
        </button>
        <button role="menuitem" onClick={act(() => exportJson(p.id, p.name))}>
          <Download size={15} /> Export .json…
        </button>
        <button role="menuitem" onClick={act(() => st().setUI({ linkDialogFor: p.id }))}>
          <Link2 size={15} /> {p.linkedPath ? "Linked file…" : "Link to a file…"}
        </button>
        <div className="menu-divider" />
        <button
          role="menuitem"
          className="danger"
          onClick={act(async () => {
            await projectsApi.trash(p.id);
            toast(`Moved “${p.name}” to Trash`);
          })}
        >
          <Trash2 size={15} /> Move to Trash
        </button>
      </div>
    </>
  );
}

function ProjectCard({ p, reload, big = false }: { p: ProjectMeta; reload: () => void; big?: boolean }) {
  // The ⋯ button the menu is open for (null = closed).
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const closeMenu = useCallback(() => setMenuAnchor(null), []);
  const [renaming, setRenaming] = useState(false);
  const dark = useStore((s) => s.theme === "dark");

  return (
    <div className={`project-card ${big ? "big" : ""}`}>
      <button className="card-open" data-card onClick={() => !renaming && openInEditor(p.id)} title={`Open ${p.name}`}>
        <div className={`card-thumb ${dark ? "dark" : ""}`}>
          {p.hasThumb ? <img src={projectsApi.thumbUrl(p)} alt="" draggable={false} loading="lazy" /> : <FileText size={big ? 40 : 28} />}
        </div>
      </button>
      <div className="card-body">
        {renaming ? (
          <input
            className="card-rename"
            autoFocus
            defaultValue={p.name}
            aria-label="Drawing name"
            onFocus={(e) => e.target.select()}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") {
                e.currentTarget.value = p.name;
                e.currentTarget.blur();
              }
            }}
            onBlur={(e) => {
              setRenaming(false);
              if (e.target.value.trim() && e.target.value.trim() !== p.name) projectsApi.patch(p.id, { name: e.target.value }).then(reload, failed);
            }}
          />
        ) : (
          <div className="card-title" onDoubleClick={() => setRenaming(true)} title={p.name}>
            {p.pinned && <Star size={13} className="pin-star" />}
            <span>{p.name}</span>
          </div>
        )}
        <div className="card-meta">
          Edited {timeAgo(p.updated)} · {plural(p.pageCount, "page")}
        </div>
        {p.linkedPath && (
          <div className={`card-link ${p.fileState ?? "ok"}`} title={p.linkedPath}>
            <Link2 size={12} /> {fileOf(p.linkedPath)}
            {p.fileState === "changed" && " · changed on disk"}
            {p.fileState === "missing" && " · file missing"}
          </div>
        )}
        {p.snippet && <Snippet text={p.snippet} />}
      </div>
      <button className="card-more" title="More" aria-label={`More actions for ${p.name}`} aria-haspopup="menu" aria-expanded={!!menuAnchor} onClick={(e) => setMenuAnchor(menuAnchor ? null : e.currentTarget)}>
        <MoreHorizontal size={16} />
      </button>
      {menuAnchor && <CardMenu p={p} anchor={menuAnchor} onClose={closeMenu} onRename={() => setRenaming(true)} reload={reload} />}
    </div>
  );
}

// ---------- folders ----------

function FolderSection({ folder, reload, onRemoved }: { folder: Folder; reload: () => void; onRemoved: () => void }) {
  const [files, setFiles] = useState<FolderFile[] | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [scanning, setScanning] = useState(false);

  const scan = useCallback(async (manual = false) => {
    if (manual) setScanning(true);
    try {
      const r = await foldersApi.scan(folder.id);
      setFiles(r.files);
      setTruncated(r.truncated);
    } catch (err) {
      failed(err);
    } finally {
      setScanning(false);
    }
  }, [folder.id]);

  useEffect(() => {
    const t = window.setTimeout(scan, 0);
    return () => clearTimeout(t);
  }, [scan]);

  const importFile = async (f: FolderFile, link: boolean) => {
    try {
      const m = await foldersApi.importFile(folder.id, f.rel, link);
      toast(link ? `Imported and linked ${f.name}` : `Imported ${f.name}`);
      reload();
      scan();
      return m;
    } catch (err) {
      failed(err);
    }
  };

  return (
    <div className="folder-section">
      <div className="folder-head">
        <FolderOpen size={16} />
        <code title={folder.path}>{folder.path}</code>
        <span className="muted">{files ? plural(files.length, "drawing") : "…"}</span>
        <button className="ghost" onClick={() => scan(true)} title="Rescan" disabled={scanning}>
          <RefreshCw size={14} className={scanning ? "spin" : ""} />
        </button>
        <button
          className="ghost"
          title="Stop showing this folder"
          onClick={async () => {
            if (!confirm(`Stop showing ${folder.path}? Files stay where they are; drawings linked to files in it are unlinked.`)) return;
            await foldersApi.remove(folder.id).catch(failed);
            onRemoved();
          }}
        >
          <X size={14} />
        </button>
      </div>
      {files && files.length === 0 && <p className="muted small folder-empty">No sketchboard .json files in here yet.</p>}
      {files && files.length > 0 && (
        <ul className="folder-files">
          {files.map((f) => (
            <li key={f.path}>
              <FileText size={14} />
              <span className="file-rel" title={f.path}>
                {f.rel}
              </span>
              <span className="muted small">{timeAgo(f.mtime)}</span>
              {f.projectId ? (
                <button onClick={() => openInEditor(f.projectId!)}>Open</button>
              ) : (
                <>
                  <button onClick={() => importFile(f, false)} title="Copy into sketchboard; the file is left as it is">
                    Import
                  </button>
                  <button
                    className="primary"
                    onClick={async () => {
                      const m = await importFile(f, true);
                      if (m) openInEditor(m.id);
                    }}
                    title="Import and keep the file updated on every save"
                  >
                    Import & link
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      {truncated && <p className="muted small">This folder is very large — only part of it was scanned. Add a more specific subfolder to see everything.</p>}
    </div>
  );
}

// ---------- settings drawer ----------

function SettingsDrawer({ onClose, folders, setFolders }: { onClose: () => void; folders: Folder[]; setFolders: (f: Folder[]) => void }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [backups, setBackups] = useState<{ dir: string; backups: BackupInfo[] } | null>(null);
  const [path, setPath] = useState("");
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(() => {
    statusApi().then(setStatus, () => undefined);
    backupsApi.list().then(setBackups, () => undefined);
  }, []);
  useEffect(load, [load]);

  const add = async () => {
    setErr(null);
    try {
      const f = await foldersApi.add(path);
      setFolders(folders.some((x) => x.id === f.id) ? folders : [...folders, f]);
      setPath("");
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : "Couldn't add that folder");
    }
  };

  return (
    <aside className="settings-drawer" role="dialog" aria-label="Folders and backups">
      <div className="panel-header">
        <span>Folders & backups</span>
        <button onClick={onClose} title="Close">
          <X size={16} />
        </button>
      </div>

      <section>
        <h3>Folders</h3>
        <p className="muted small">Folders where you keep .json drawings. Home lists every drawing inside them (subfolders too), and you can link drawings to files there.</p>
        <div className="inline-row">
          <input value={path} onChange={(e) => setPath(e.target.value)} placeholder="~/Documents/drawings" onKeyDown={(e) => e.key === "Enter" && path.trim() && add()} aria-label="Folder path" />
          <button onClick={add} disabled={!path.trim()}>
            <FolderPlus size={14} /> Add
          </button>
        </div>
        {err && <p className="form-error">{err}</p>}
        <ul className="plain-list">
          {folders.map((f) => (
            <li key={f.id}>
              <FolderOpen size={14} /> <code>{f.path}</code>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h3>Backups</h3>
        <p className="muted small">A copy of the whole database is made every day (14 daily and 8 weekly are kept).</p>
        <button
          onClick={async () => {
            try {
              const r = await backupsApi.now();
              toast(`Backed up to ${r.path}`);
              load();
            } catch (e) {
              failed(e);
            }
          }}
        >
          <Archive size={14} /> Back up now
        </button>
        {backups && (
          <>
            <p className="small">
              Saved in <code>{backups.dir}</code>
            </p>
            <ul className="plain-list small">
              {backups.backups.slice(0, 5).map((b) => (
                <li key={b.name}>
                  {new Date(b.created).toLocaleString()} · {(b.size / 1024 / 1024).toFixed(1)} MB{b.manual ? " · manual" : ""}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {status && (
        <section>
          <h3>Storage</h3>
          <p className="small">
            <HardDrive size={13} /> <code>{status.dbPath}</code>
          </p>
          <p className="muted small">
            {plural(status.counts.projects, "drawing")} · {plural(status.counts.versions, "saved version")} · {plural(status.counts.blobs, "image")}
          </p>
        </section>
      )}
    </aside>
  );
}

// ---------- page ----------

function Section({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="home-section">
      <div className="home-section-head">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Arrow keys move between cards in reading order (left/right) or by row (up/down). */
function onGridKey(e: React.KeyboardEvent) {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  if (!keys.includes(e.key)) return;
  const cur = document.activeElement as HTMLElement | null;
  if (!cur?.dataset || !("card" in cur.dataset)) return;
  const cards = [...document.querySelectorAll<HTMLElement>("[data-card]")];
  const i = cards.indexOf(cur);
  let next: HTMLElement | undefined;
  if (e.key === "ArrowLeft") next = cards[i - 1];
  else if (e.key === "ArrowRight") next = cards[i + 1];
  else {
    const r = cur.getBoundingClientRect();
    const down = e.key === "ArrowDown";
    next = cards
      .filter((c) => {
        const cr = c.getBoundingClientRect();
        return down ? cr.top > r.bottom - 4 : cr.bottom < r.top + 4;
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return Math.abs(ar.top - r.top) - Math.abs(br.top - r.top) || Math.abs(ar.left - r.left) - Math.abs(br.left - r.left);
      })[0];
  }
  if (next) {
    e.preventDefault();
    next.focus();
  }
}

export default function Home() {
  const theme = useStore((s) => s.theme);
  const [projects, setProjects] = useState<ProjectMeta[] | null>(null);
  const [results, setResults] = useState<ProjectMeta[] | null>(null);
  const [trash, setTrash] = useState<ProjectMeta[]>([]);
  const [showTrash, setShowTrash] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [query, setQuery] = useState("");
  const [settings, setSettings] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);
  const templates = useMemo(() => TEMPLATES.map((t) => ({ ...t, elements: t.build() })), []);

  const reload = useCallback(async () => {
    try {
      const [list, trashed, fs] = await Promise.all([projectsApi.list(), projectsApi.list({ trash: true }), foldersApi.list()]);
      setProjects(list);
      setTrash(trashed);
      void fillMissingThumbs(list);
      setFolders(fs);
      setError(null);
    } catch {
      setError("Can't reach the sketchboard service.");
    }
  }, []);

  useEffect(() => {
    document.title = "Home — sketchboard";
    const first = window.setTimeout(reload, 0);
    let timer: number | undefined;
    const off = onServerEvent(() => {
      clearTimeout(timer);
      timer = window.setTimeout(reload, 250);
    });
    const tick = window.setInterval(() => setTick((t) => t + 1), 60_000);
    return () => {
      off();
      clearTimeout(first);
      clearTimeout(timer);
      clearInterval(tick);
    };
  }, [reload]);

  useEffect(() => {
    if (!query.trim()) return;
    const t = window.setTimeout(() => {
      projectsApi.list({ q: query }).then(setResults, () => undefined);
    }, 120);
    return () => clearTimeout(t);
  }, [query, projects]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        openDocument();
      } else if (e.key.toLowerCase() === "n" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        createAndOpen("Untitled drawing").catch(failed);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const fromTemplate = (t: (typeof templates)[number]) => {
    const id = crypto.randomUUID();
    const doc: DocumentFile = { type: "sketchboard", version: 2, pages: [{ id, name: "Page 1", elements: t.elements }], activePageId: id };
    createAndOpen(t.name, doc).catch(failed);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => /\.json$/i.test(f.name) || f.type === "application/json");
    if (!files.length) {
      toast("Drop .json drawing files to import them");
      return;
    }
    const done = await importFiles(files);
    if (done.length === 1) openInEditor(done[0].id);
    else reload();
  };

  const pinned = projects?.filter((p) => p.pinned) ?? [];
  const recent = projects?.filter((p) => !p.pinned) ?? [];
  const latest = projects?.find((p) => p.opened) ?? projects?.[0];

  return (
    <div
      className={`home ${dragging ? "dragging" : ""} ${settings ? "settings-open" : ""}`}
      onDragOver={(e) => {
        if ([...e.dataTransfer.types].includes("Files")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={onDrop}
      onKeyDown={onGridKey}
    >
      <header className="home-header">
        <div className="home-brand">
          <span className="brand-mark">✎</span> sketchboard
        </div>
        <div className="home-search">
          <Search size={16} />
          <input
            ref={searchRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search drawings and the text inside them"
            aria-label="Search drawings"
            onKeyDown={(e) => {
              if (e.key === "Escape") setQuery("");
              if (e.key === "Enter" && results?.[0]) openInEditor(results[0].id);
            }}
          />
          {query ? (
            <button className="ghost" onClick={() => setQuery("")} title="Clear search">
              <X size={14} />
            </button>
          ) : (
            <kbd>/</kbd>
          )}
        </div>
        <div className="home-actions">
          <button className="primary" onClick={() => createAndOpen("Untitled drawing").catch(failed)} title="New drawing (N)">
            <Plus size={16} /> New drawing
          </button>
          <button onClick={openDocument} title="Import .json files (Ctrl+O)">
            <Upload size={16} /> Open file…
          </button>
          <button className="icon" onClick={() => st().toggleTheme()} title={theme === "dark" ? "Light mode" : "Dark mode"} aria-label="Toggle theme">
            {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          <button className={`icon ${settings ? "active" : ""}`} onClick={() => setSettings((s) => !s)} title="Folders & backups" aria-label="Folders and backups">
            <Settings size={16} />
          </button>
        </div>
      </header>

      <main className="home-main">
        {error && (
          <div className="home-error" role="alert">
            {error} <button onClick={reload}>Retry</button>
          </div>
        )}

        {results && query.trim() ? (
          <Section title={results.length ? `${plural(results.length, "match")} for “${query}”` : `Nothing matches “${query}”`}>
            <div className="card-grid">
              {results.map((p) => (
                <ProjectCard key={p.id} p={p} reload={reload} />
              ))}
            </div>
          </Section>
        ) : (
          <>
            {latest && (
              <section className="continue">
                <div className="continue-text">
                  <span className="eyebrow">Continue where you left off</span>
                  <h1>{latest.name}</h1>
                  <p className="muted">
                    Edited {timeAgo(latest.updated)} · {plural(latest.pageCount, "page")} · {plural(latest.elementCount, "element")}
                  </p>
                  <button className="primary" data-card onClick={() => openInEditor(latest.id)}>
                    Open <ArrowRight size={16} />
                  </button>
                </div>
                <button className={`continue-thumb ${theme === "dark" ? "dark" : ""}`} onClick={() => openInEditor(latest.id)} tabIndex={-1} aria-hidden>
                  {latest.hasThumb ? <img src={projectsApi.thumbUrl(latest)} alt="" draggable={false} /> : <FileText size={48} />}
                </button>
              </section>
            )}

            <Section title="Start something new">
              <div className="template-row">
                <button className="template-card blank" data-card onClick={() => createAndOpen("Untitled drawing").catch(failed)}>
                  <div className="template-thumb">
                    <FilePlus2 size={28} />
                  </div>
                  <span>Blank drawing</span>
                </button>
                {templates.map((t) => (
                  <button key={t.id} className="template-card" data-card onClick={() => fromTemplate(t)} title={t.description}>
                    <div className="template-thumb">
                      <Thumbnail elements={t.elements} size={110} dark={theme === "dark"} />
                    </div>
                    <span>{t.name}</span>
                  </button>
                ))}
              </div>
            </Section>

            {pinned.length > 0 && (
              <Section title="Pinned">
                <div className="card-grid">
                  {pinned.map((p) => (
                    <ProjectCard key={p.id} p={p} reload={reload} />
                  ))}
                </div>
              </Section>
            )}

            <Section title="Recent">
              {projects === null && !error && <p className="muted">Loading…</p>}
              {projects && projects.length === 0 && (
                <div className="empty-state">
                  <p>
                    <b>No drawings yet.</b> Start a blank one, pick a template, or drop <code>.json</code> files anywhere on this page to import them.
                  </p>
                </div>
              )}
              <div className="card-grid">
                {recent.map((p) => (
                  <ProjectCard key={p.id} p={p} reload={reload} />
                ))}
              </div>
            </Section>

            <Section
              title="Folders"
              action={
                <button className="ghost" onClick={() => setSettings(true)}>
                  <FolderPlus size={14} /> Add folder
                </button>
              }
            >
              {folders.length === 0 ? (
                <p className="muted">Add the folders where you keep .json drawings, and every drawing in them shows up here — no more hunting through folders.</p>
              ) : (
                folders.map((f) => <FolderSection key={f.id} folder={f} reload={reload} onRemoved={reload} />)
              )}
            </Section>

            {trash.length > 0 && (
              <Section
                title={`Trash (${trash.length})`}
                action={
                  <button className="ghost" onClick={() => setShowTrash((s) => !s)}>
                    {showTrash ? "Hide" : "Show"}
                  </button>
                }
              >
                {showTrash && (
                  <>
                    <p className="muted small">Drawings in Trash are deleted for good after 30 days.</p>
                    <ul className="trash-list">
                      {trash.map((p) => (
                        <li key={p.id}>
                          <FileText size={14} />
                          <span>{p.name}</span>
                          <span className="muted small">deleted {timeAgo(p.deleted)}</span>
                          <button onClick={() => projectsApi.patch(p.id, { deleted: false }).then(reload, failed)}>
                            <RotateCcw size={14} /> Restore
                          </button>
                          <button
                            className="danger"
                            onClick={() => confirm(`Delete “${p.name}” and all its history for good?`) && projectsApi.purge(p.id).then(reload, failed)}
                          >
                            <Trash2 size={14} /> Delete forever
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </Section>
            )}
          </>
        )}
      </main>

      {settings && <SettingsDrawer onClose={() => setSettings(false)} folders={folders} setFolders={(fs) => setFolders(fs)} />}
      {dragging && (
        <div className="drop-hint">
          <Upload size={28} /> Drop to import
        </div>
      )}
      <LinkFileDialog onChanged={reload} />
      <Toast />
    </div>
  );
}

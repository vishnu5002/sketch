// Registered folders and linked .json files. The server never touches a path
// outside a folder the user registered.
import { open, readdir, readFile, realpath, rename, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { BadRequest } from "./docs.mjs";

const MAX_FILE = 60 * 1024 * 1024;
const SKIP = new Set(["node_modules", ".git", ".hg", ".svn", "dist", "build", ".cache", "__pycache__", ".venv", "venv"]);
const LINK_DEBOUNCE = 800;
const WATCH_INTERVAL = 2500;

export function expandPath(input) {
  if (typeof input !== "string" || !input.trim()) throw new BadRequest("folder path is required");
  let p = input.trim();
  if (p === "~" || p.startsWith("~/")) p = join(homedir(), p.slice(1));
  if (!isAbsolute(p)) throw new BadRequest("use a full path, e.g. ~/Documents/drawings");
  return resolve(p);
}

/** Canonical directory path for registering, or a 400 explaining why not. */
export async function checkFolder(input) {
  const p = await realpath(expandPath(input)).catch(() => {
    throw new BadRequest("that folder doesn't exist");
  });
  if (!(await stat(p)).isDirectory()) throw new BadRequest("that path is a file, not a folder");
  if (p === "/" || p === homedir()) throw new BadRequest("pick a specific folder rather than / or your whole home folder");
  return p;
}

const inside = (root, p) => p === root || p.startsWith(root + sep);

/** Resolve `p` (following symlinks as far as it exists) and confirm it sits inside one of `roots`. */
export async function confinedPath(p, roots) {
  const abs = resolve(p);
  let real;
  try {
    real = await realpath(abs);
  } catch {
    // New file: its parent directory must exist and be inside a root.
    real = join(await realpath(dirname(abs)).catch(() => abs), basename(abs));
  }
  const root = roots.find((r) => inside(r, real));
  if (!root) throw Object.assign(new Error("path is outside your registered folders"), { status: 403 });
  return { path: real, root };
}

async function looksLikeSketch(path, size) {
  if (size > MAX_FILE) return false;
  const fh = await open(path, "r");
  try {
    const { buffer, bytesRead } = await fh.read(Buffer.alloc(4096), 0, 4096, 0);
    return /"type"\s*:\s*"sketchboard"/.test(buffer.subarray(0, bytesRead).toString("utf8"));
  } finally {
    await fh.close();
  }
}

/** Find sketchboard .json files under `root` (bounded so a huge tree can't stall the server). */
export async function scanFolder(root, { maxDepth = 8, maxEntries = 20_000, budgetMs = 4000 } = {}) {
  const started = Date.now();
  const files = [];
  let visited = 0;
  let truncated = false;
  async function walk(dir, depth) {
    if (depth > maxDepth || truncated) return;
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (++visited > maxEntries || Date.now() - started > budgetMs) {
        truncated = true;
        return;
      }
      if (ent.name.startsWith(".") || SKIP.has(ent.name)) continue;
      const p = join(dir, ent.name);
      if (ent.isDirectory()) await walk(p, depth + 1);
      else if (ent.isFile() && ent.name.toLowerCase().endsWith(".json")) {
        try {
          const st = await stat(p);
          if (await looksLikeSketch(p, st.size)) files.push({ path: p, rel: relative(root, p), name: ent.name, size: st.size, mtime: Math.floor(st.mtimeMs) });
        } catch {
          // unreadable — skip
        }
      }
    }
  }
  await walk(root, 0);
  files.sort((a, b) => b.mtime - a.mtime);
  return { files, truncated };
}

export async function readSketchFile(path) {
  const st = await stat(path).catch(() => {
    throw Object.assign(new Error("that file doesn't exist"), { status: 404 });
  });
  if (st.size > MAX_FILE) throw Object.assign(new Error("file too large"), { status: 413 });
  let data;
  try {
    data = JSON.parse(await readFile(path, "utf8"));
  } catch {
    throw new BadRequest("that file isn't valid JSON");
  }
  if (data?.type !== "sketchboard" && !Array.isArray(data?.pages)) throw new BadRequest("that file isn't a sketchboard drawing");
  return { doc: data, mtime: Math.floor(st.mtimeMs) };
}

/** Write atomically: a crash mid-write never leaves a half-written drawing. */
async function writeAtomic(path, text) {
  const tmp = join(dirname(path), `.${basename(path)}.${process.pid}.tmp`);
  await writeFile(tmp, text, { mode: 0o644 });
  await rename(tmp, path);
  return Math.floor((await stat(path)).mtimeMs);
}

export function validLinkName(name) {
  if (typeof name !== "string") throw new BadRequest("file name is required");
  const n = name.trim();
  if (!n || n.includes("\0") || n.split(/[\\/]/).some((part) => part === ".." || part === "")) throw new BadRequest("bad file name");
  return n.toLowerCase().endsWith(".json") ? n : `${n}.sketchboard.json`;
}

/**
 * Keeps linked files in step with the database: writes them after saves, and
 * polls for outside changes (git pull, cloud sync, another editor).
 */
export function createLinker(store, log = console) {
  const timers = new Map();
  const writing = new Set();
  const state = new Map(); // id -> "ok" | "changed" | "missing" | "error"

  const roots = () => store.listFolders().map((f) => f.path);

  function setState(id, s) {
    if (state.get(id) === s) return;
    state.set(id, s);
    store.events.emit("change", { type: "file", id, state: s });
  }

  async function writeNow(id) {
    const p = store.getProject(id);
    if (!p.linkedPath) return;
    if (state.get(id) === "changed") return; // don't clobber outside edits; the user decides
    writing.add(id);
    try {
      const { path } = await confinedPath(p.linkedPath, roots());
      const mtime = await writeAtomic(path, JSON.stringify(store.embed(p.doc)));
      store.setLinkedMtime(id, mtime);
      setState(id, "ok");
    } catch (err) {
      log.error(`linked file write failed for ${id}:`, err.message);
      setState(id, "error");
    } finally {
      writing.delete(id);
    }
  }

  function scheduleWrite(id) {
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(() => {
        timers.delete(id);
        writeNow(id);
      }, LINK_DEBOUNCE),
    );
  }

  store.events.on("change", (e) => {
    if (e.type === "project" && e.origin !== "linked-file") {
      const meta = store.getMeta(e.id);
      if (meta.linkedPath) scheduleWrite(e.id);
    }
  });

  async function poll() {
    for (const p of store.linkedProjects()) {
      if (writing.has(p.id) || timers.has(p.id)) continue;
      try {
        const st = await stat(p.linked_path);
        const m = Math.floor(st.mtimeMs);
        if (p.linked_mtime != null && Math.abs(m - p.linked_mtime) > 1) setState(p.id, "changed");
        else if (state.get(p.id) === "missing" || state.get(p.id) === "error") setState(p.id, "ok");
      } catch {
        setState(p.id, "missing");
      }
    }
  }
  const timer = setInterval(() => poll().catch(() => undefined), WATCH_INTERVAL);
  timer.unref();

  async function link(id, folderId, fileName, { overwrite = false } = {}) {
    const folder = store.getFolder(folderId);
    if (!folder) throw new BadRequest("pick one of your registered folders");
    const { path } = await confinedPath(join(folder.path, validLinkName(fileName)), roots());
    const exists = await stat(path).then(
      () => true,
      () => false,
    );
    if (exists && !overwrite) throw Object.assign(new Error("a file with that name already exists"), { status: 409, code: "exists" });
    store.setLink(id, path, null);
    state.delete(id);
    await writeNow(id);
    return store.getMeta(id);
  }

  /** Link to a file that already holds this project's content (after importing it). */
  async function linkExisting(id, path, mtime) {
    const { path: real } = await confinedPath(path, roots());
    store.setLink(id, real, mtime);
    setState(id, "ok");
  }

  function unlink(id) {
    clearTimeout(timers.get(id));
    timers.delete(id);
    store.setLink(id, null, null);
    state.delete(id);
  }

  /** After an outside change: take the file's version, or overwrite it with ours. */
  async function resolveChange(id, action, makeSafety) {
    const p = store.getProject(id);
    if (!p.linkedPath) throw new BadRequest("project isn't linked to a file");
    const { path } = await confinedPath(p.linkedPath, roots());
    if (action === "reload") {
      const { doc, mtime } = await readSketchFile(path);
      await makeSafety(p);
      const { rev } = store.saveDoc(id, { doc, force: true, origin: "linked-file" });
      store.setLinkedMtime(id, mtime);
      setState(id, "ok");
      return { rev };
    }
    if (action === "keep") {
      state.set(id, "ok");
      await writeNow(id);
      return { rev: store.getMeta(id).rev };
    }
    throw new BadRequest("action must be reload or keep");
  }

  return { link, linkExisting, unlink, resolveChange, fileState: (id) => state.get(id) ?? "ok", roots, poll, flush: () => Promise.all([...timers.keys()].map((id) => (clearTimeout(timers.get(id)), timers.delete(id), writeNow(id)))) };
}

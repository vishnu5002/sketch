// Data access for projects, versions, blobs, library, settings and folders.
import { createHash, randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { transaction } from "./db.mjs";
import { BadRequest, blobRefs, cleanName, docHash, elementCount, searchBody, summarize, validateDoc, versionsToPrune } from "./docs.mjs";

export class NotFound extends Error {
  constructor(what = "not found") {
    super(what);
    this.status = 404;
  }
}

export class Conflict extends Error {
  constructor(rev) {
    super("project changed elsewhere");
    this.status = 409;
    this.rev = rev;
  }
}

const IMAGE_MIME = /^image\/(png|jpeg|gif|webp|svg\+xml|bmp|avif)$/;
const MAX_BLOB = 25 * 1024 * 1024;
const TRASH_DAYS = 30;

export function createStore(db) {
  const events = new EventEmitter();
  events.setMaxListeners(100);
  const q = (sql) => db.prepare(sql);

  const meta = (row) =>
    row && {
      id: row.id,
      name: row.name,
      created: row.created,
      updated: row.updated,
      opened: row.opened,
      pinned: !!row.pinned,
      deleted: row.deleted,
      hasThumb: row.has_thumb === 1,
      pageCount: row.page_count,
      elementCount: row.element_count,
      linkedPath: row.linked_path,
      sourcePath: row.source_path,
      rev: row.rev,
    };
  const META_COLS = `p.id, p.name, p.created, p.updated, p.opened, p.pinned, p.deleted, (p.thumb IS NOT NULL) AS has_thumb,
    p.page_count, p.element_count, p.linked_path, p.source_path, d.rev`;

  // ---------- blobs ----------

  function putBlob(bytes, mime) {
    if (!IMAGE_MIME.test(mime)) throw new BadRequest(`unsupported image type ${mime}`);
    if (bytes.length > MAX_BLOB) throw Object.assign(new Error("image too large"), { status: 413 });
    const hash = createHash("sha256").update(bytes).digest("hex");
    q("INSERT OR IGNORE INTO blobs (hash, mime, size, created, data) VALUES (?, ?, ?, ?, ?)").run(hash, mime, bytes.length, Date.now(), bytes);
    return hash;
  }

  const getBlob = (hash) => q("SELECT mime, data FROM blobs WHERE hash = ?").get(hash);

  /** Move embedded data-URL images into the blob table, so docs and versions stay small. */
  function externalize(doc) {
    let changed = false;
    const pages = doc.pages.map((p) => ({
      ...p,
      elements: p.elements.map((e) => {
        if (e?.type !== "image" || typeof e.src !== "string" || !e.src.startsWith("data:")) return e;
        const m = /^data:([^;,]+)(;base64)?,(.*)$/s.exec(e.src);
        if (!m) return e;
        const bytes = m[2] ? Buffer.from(m[3], "base64") : Buffer.from(decodeURIComponent(m[3]));
        changed = true;
        return { ...e, src: `/api/blobs/${putBlob(bytes, m[1])}` };
      }),
    }));
    return changed ? { ...doc, pages } : doc;
  }

  /** The reverse, for portable .json files: every image embedded again. */
  function embed(doc) {
    const cache = new Map();
    return {
      ...doc,
      pages: doc.pages.map((p) => ({
        ...p,
        elements: p.elements.map((e) => {
          const m = e?.type === "image" && typeof e.src === "string" && /^\/api\/blobs\/([0-9a-f]{64})$/.exec(e.src);
          if (!m) return e;
          if (!cache.has(m[1])) {
            const b = getBlob(m[1]);
            cache.set(m[1], b ? `data:${b.mime};base64,${Buffer.from(b.data).toString("base64")}` : "");
          }
          return { ...e, src: cache.get(m[1]) };
        }),
      })),
    };
  }

  /** Delete blobs that no document or version references any more. */
  function collectGarbage() {
    const used = new Set();
    for (const { doc } of q("SELECT doc FROM project_docs").iterate()) for (const h of blobRefs(doc)) used.add(h);
    for (const { doc } of q("SELECT doc FROM versions").iterate()) for (const h of blobRefs(doc)) used.add(h);
    const del = q("DELETE FROM blobs WHERE hash = ?");
    let removed = 0;
    for (const { hash } of q("SELECT hash FROM blobs").all()) {
      if (!used.has(hash)) {
        del.run(hash);
        removed++;
      }
    }
    return removed;
  }

  // ---------- projects ----------

  function indexSearch(id, name, doc) {
    q("DELETE FROM project_search WHERE project_id = ?").run(id);
    q("INSERT INTO project_search (project_id, name, body) VALUES (?, ?, ?)").run(id, name, searchBody(doc));
  }

  function getMeta(id) {
    const row = q(`SELECT ${META_COLS} FROM projects p JOIN project_docs d ON d.project_id = p.id WHERE p.id = ?`).get(id);
    if (!row) throw new NotFound("project not found");
    return meta(row);
  }

  function listProjects({ q: query, trash = false, limit = 200 } = {}) {
    const where = trash ? "p.deleted IS NOT NULL" : "p.deleted IS NULL";
    if (query && query.trim()) {
      // Prefix-match every word: "grp rew" finds "GRPO rewards".
      const terms = query
        .trim()
        .split(/\s+/)
        .map((t) => t.replace(/["*^():]/g, ""))
        .filter(Boolean)
        .map((t) => `"${t}"*`)
        .join(" ");
      if (!terms) return [];
      const rows = q(
        `SELECT ${META_COLS}, snippet(project_search, 2, '[[', ']]', '…', 10) AS snip, bm25(project_search, 8.0, 1.0) AS rank
         FROM project_search s JOIN projects p ON p.id = s.project_id JOIN project_docs d ON d.project_id = p.id
         WHERE project_search MATCH ? AND ${where} ORDER BY rank LIMIT ?`,
      ).all(terms, limit);
      return rows.map((r) => ({ ...meta(r), snippet: r.snip }));
    }
    return q(
      `SELECT ${META_COLS} FROM projects p JOIN project_docs d ON d.project_id = p.id WHERE ${where}
       ORDER BY COALESCE(p.opened, p.updated) DESC LIMIT ?`,
    )
      .all(limit)
      .map(meta);
  }

  function createProject({ name, doc, sourcePath = null }) {
    const id = randomUUID();
    const now = Date.now();
    const clean = externalize(validateDoc(doc ?? { pages: [{ id: randomUUID(), name: "Page 1", elements: [] }] }));
    const n = cleanName(name);
    transaction(db, () => {
      q(
        `INSERT INTO projects (id, name, created, updated, opened, page_count, element_count, source_path)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, n, now, now, null, clean.pages.length, elementCount(clean), sourcePath);
      q("INSERT INTO project_docs (project_id, rev, doc, content_hash) VALUES (?, 1, ?, ?)").run(id, JSON.stringify(clean), docHash(clean));
      indexSearch(id, n, clean);
    });
    events.emit("change", { type: "project", id, rev: 1 });
    return getMeta(id);
  }

  function getProject(id) {
    const m = getMeta(id);
    const { doc } = q("SELECT doc FROM project_docs WHERE project_id = ?").get(id);
    return { ...m, doc: JSON.parse(doc) };
  }

  /** Save a document. `baseRev` must match the stored revision unless `force` is set. */
  function saveDoc(id, { baseRev, doc, thumb, force = false, origin = null }) {
    const clean = externalize(validateDoc(doc));
    let changed = false;
    const rev = transaction(db, () => {
      const cur = q("SELECT d.rev, d.content_hash, p.name FROM project_docs d JOIN projects p ON p.id = d.project_id WHERE d.project_id = ?").get(id);
      if (!cur) throw new NotFound("project not found");
      if (!force && baseRev !== cur.rev) throw new Conflict(cur.rev);
      const next = cur.rev + 1;
      const hash = docHash(clean);
      q("UPDATE project_docs SET rev = ?, doc = ?, content_hash = ? WHERE project_id = ?").run(next, JSON.stringify(clean), hash, id);
      // Panning and page switches are saved too, but only real edits count as "edited".
      changed = hash !== cur.content_hash;
      if (changed) {
        q("UPDATE projects SET updated = ?, page_count = ?, element_count = ? WHERE id = ?").run(Date.now(), clean.pages.length, elementCount(clean), id);
        indexSearch(id, cur.name, clean);
      }
      if (thumb) q("UPDATE projects SET thumb = ? WHERE id = ?").run(thumb, id);
      return next;
    });
    events.emit("change", { type: "project", id, rev, origin, changed });
    return { rev };
  }

  function patchProject(id, patch) {
    getMeta(id);
    if (patch.name !== undefined) {
      const name = cleanName(patch.name);
      q("UPDATE projects SET name = ? WHERE id = ?").run(name, id);
      const { doc } = q("SELECT doc FROM project_docs WHERE project_id = ?").get(id);
      indexSearch(id, name, JSON.parse(doc));
    }
    if (patch.pinned !== undefined) q("UPDATE projects SET pinned = ? WHERE id = ?").run(patch.pinned ? 1 : 0, id);
    if (patch.opened) q("UPDATE projects SET opened = ? WHERE id = ?").run(Date.now(), id);
    if (patch.deleted !== undefined) q("UPDATE projects SET deleted = ? WHERE id = ?").run(patch.deleted ? Date.now() : null, id);
    const m = getMeta(id);
    events.emit("change", { type: "meta", id });
    return m;
  }

  function duplicateProject(id) {
    const src = getProject(id);
    const copy = createProject({ name: `${src.name} copy`, doc: src.doc });
    const thumb = q("SELECT thumb FROM projects WHERE id = ?").get(id)?.thumb;
    if (thumb) q("UPDATE projects SET thumb = ? WHERE id = ?").run(thumb, copy.id);
    return getMeta(copy.id);
  }

  function purgeProject(id) {
    getMeta(id);
    transaction(db, () => {
      q("DELETE FROM project_search WHERE project_id = ?").run(id);
      q("DELETE FROM projects WHERE id = ?").run(id);
    });
    collectGarbage();
    events.emit("change", { type: "meta", id });
  }

  function purgeOldTrash(now = Date.now()) {
    const old = q("SELECT id FROM projects WHERE deleted IS NOT NULL AND deleted < ?").all(now - TRASH_DAYS * 86_400_000);
    for (const { id } of old) purgeProject(id);
    return old.length;
  }

  const getThumb = (id) => q("SELECT thumb FROM projects WHERE id = ?").get(id)?.thumb ?? null;
  function setThumb(id, thumb) {
    getMeta(id);
    q("UPDATE projects SET thumb = ? WHERE id = ?").run(thumb, id);
    events.emit("change", { type: "meta", id });
  }

  function setLink(id, linkedPath, mtime) {
    getMeta(id);
    q("UPDATE projects SET linked_path = ?, linked_mtime = ? WHERE id = ?").run(linkedPath, mtime ?? null, id);
    events.emit("change", { type: "meta", id });
  }
  const setLinkedMtime = (id, mtime) => q("UPDATE projects SET linked_mtime = ? WHERE id = ?").run(mtime, id);
  const linkedProjects = () => q("SELECT id, linked_path, linked_mtime FROM projects WHERE linked_path IS NOT NULL AND deleted IS NULL").all();
  const projectBySource = (path) => q("SELECT id FROM projects WHERE (source_path = ? OR linked_path = ?) AND deleted IS NULL").get(path, path)?.id ?? null;

  // ---------- versions ----------

  const versionMeta = (r) => ({
    id: r.id,
    created: r.created,
    kind: r.kind,
    label: r.label ?? undefined,
    reason: r.reason ?? undefined,
    summary: r.summary,
    pageCount: r.page_count,
    elementCount: r.element_count,
    thumb: r.has_thumb ? `/api/versions/${r.id}/thumb` : undefined,
    hash: r.hash,
  });
  const V_COLS = "id, created, kind, label, reason, summary, page_count, element_count, hash, (thumb IS NOT NULL) AS has_thumb";

  const listVersions = (projectId) => {
    getMeta(projectId);
    return q(`SELECT ${V_COLS} FROM versions WHERE project_id = ? ORDER BY created`).all(projectId).map(versionMeta);
  };

  /** Record a snapshot. Identical consecutive snapshots collapse into the existing one. */
  function addVersion(projectId, { kind, label, reason, doc, thumb, force = false, created: at }) {
    if (!["auto", "named", "save", "safety"].includes(kind)) throw new BadRequest("bad version kind");
    getMeta(projectId);
    const clean = externalize(validateDoc(doc));
    const total = elementCount(clean);
    if (!total && !force && kind !== "named") return null;
    const hash = docHash(clean);
    return transaction(db, () => {
      const last = q(`SELECT ${V_COLS}, doc FROM versions WHERE project_id = ? ORDER BY created DESC LIMIT 1`).get(projectId);
      if (last && last.hash === hash) {
        // Naming an unchanged state labels the version that already captures it;
        // a safety request protects an automatic one from thinning.
        if (kind === "named") q("UPDATE versions SET kind = 'named', label = ? WHERE id = ?").run(label ?? null, last.id);
        else if (kind === "safety" && last.kind === "auto") q("UPDATE versions SET kind = 'safety', reason = ? WHERE id = ?").run(reason ?? null, last.id);
        return versionMeta(q(`SELECT ${V_COLS} FROM versions WHERE id = ?`).get(last.id));
      }
      const id = randomUUID();
      // `at` is only used when importing old history, which arrives oldest first.
      const created = Number.isFinite(at) ? at : Math.max(Date.now(), (last?.created ?? 0) + 1);
      q(
        `INSERT INTO versions (id, project_id, created, kind, label, reason, summary, hash, page_count, element_count, thumb, doc)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, projectId, created, kind, label ?? null, reason ?? null, summarize(last ? JSON.parse(last.doc) : null, clean), hash, clean.pages.length, total, thumb ?? null, JSON.stringify(clean));
      const all = q("SELECT id, created, kind FROM versions WHERE project_id = ?").all(projectId);
      const drop = versionsToPrune(all);
      const del = q("DELETE FROM versions WHERE id = ?");
      for (const v of drop) del.run(v);
      if (drop.length) collectGarbage();
      return versionMeta(q(`SELECT ${V_COLS} FROM versions WHERE id = ?`).get(id));
    });
  }

  function getVersion(id) {
    const r = q(`SELECT ${V_COLS}, project_id, doc FROM versions WHERE id = ?`).get(id);
    if (!r) throw new NotFound("version not found");
    return { ...versionMeta(r), projectId: r.project_id, doc: JSON.parse(r.doc) };
  }
  const getVersionThumb = (id) => q("SELECT thumb FROM versions WHERE id = ?").get(id)?.thumb ?? null;

  function patchVersion(id, { label }) {
    getVersion(id);
    const l = typeof label === "string" && label.trim() ? label.trim().slice(0, 120) : null;
    if (l) q("UPDATE versions SET label = ?, kind = 'named' WHERE id = ?").run(l, id);
    else q("UPDATE versions SET label = NULL WHERE id = ?").run(id);
    return versionMeta(q(`SELECT ${V_COLS} FROM versions WHERE id = ?`).get(id));
  }

  function deleteVersion(id) {
    getVersion(id);
    q("DELETE FROM versions WHERE id = ?").run(id);
    collectGarbage();
  }

  // ---------- library & settings ----------

  const getLibrary = () => q("SELECT item FROM library ORDER BY position").all().map((r) => JSON.parse(r.item));
  function setLibrary(items) {
    if (!Array.isArray(items)) throw new BadRequest("library must be an array");
    transaction(db, () => {
      q("DELETE FROM library").run();
      const ins = q("INSERT INTO library (id, position, item) VALUES (?, ?, ?)");
      items.forEach((it, i) => {
        if (!it || typeof it.id !== "string" || !Array.isArray(it.elements)) throw new BadRequest("bad library item");
        const clean = externalize({ type: "sketchboard", version: 2, pages: [{ id: "lib", name: "lib", elements: it.elements }], activePageId: "lib" });
        ins.run(it.id, i, JSON.stringify({ ...it, elements: clean.pages[0].elements }));
      });
    });
  }

  function getSettings() {
    const out = {};
    for (const { key, value } of q("SELECT key, value FROM settings").all()) out[key] = JSON.parse(value);
    return out;
  }
  function patchSettings(patch) {
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) throw new BadRequest("settings must be an object");
    transaction(db, () => {
      const up = q("INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value");
      const del = q("DELETE FROM settings WHERE key = ?");
      for (const [k, v] of Object.entries(patch)) {
        if (k.length > 64) throw new BadRequest("setting name too long");
        if (v === null) del.run(k);
        else up.run(k, JSON.stringify(v));
      }
    });
    return getSettings();
  }

  // ---------- folders ----------

  const listFolders = () => q("SELECT id, path, added FROM folders ORDER BY added").all();
  function addFolder(path) {
    const existing = q("SELECT id, path, added FROM folders WHERE path = ?").get(path);
    if (existing) return existing;
    const f = { id: randomUUID(), path, added: Date.now() };
    q("INSERT INTO folders (id, path, added) VALUES (?, ?, ?)").run(f.id, f.path, f.added);
    return f;
  }
  const removeFolder = (id) => q("DELETE FROM folders WHERE id = ?").run(id);
  const getFolder = (id) => q("SELECT id, path, added FROM folders WHERE id = ?").get(id) ?? null;

  const counts = () => ({
    projects: q("SELECT COUNT(*) AS n FROM projects WHERE deleted IS NULL").get().n,
    trash: q("SELECT COUNT(*) AS n FROM projects WHERE deleted IS NOT NULL").get().n,
    versions: q("SELECT COUNT(*) AS n FROM versions").get().n,
    blobs: q("SELECT COUNT(*) AS n FROM blobs").get().n,
  });

  return {
    events,
    putBlob,
    getBlob,
    externalize,
    embed,
    collectGarbage,
    listProjects,
    createProject,
    getProject,
    getMeta,
    saveDoc,
    patchProject,
    duplicateProject,
    purgeProject,
    purgeOldTrash,
    getThumb,
    setThumb,
    setLink,
    setLinkedMtime,
    linkedProjects,
    projectBySource,
    listVersions,
    addVersion,
    getVersion,
    getVersionThumb,
    patchVersion,
    deleteVersion,
    getLibrary,
    setLibrary,
    getSettings,
    patchSettings,
    listFolders,
    addFolder,
    removeFolder,
    getFolder,
    counts,
  };
}

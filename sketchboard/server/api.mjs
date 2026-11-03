// HTTP API under /api. Every request passes the same-origin checks in `guard` first.
import { join } from "node:path";
import { BadRequest, cleanName } from "./docs.mjs";
import { checkFolder, confinedPath, readSketchFile, scanFolder } from "./folders.mjs";

const JSON_LIMIT = 80 * 1024 * 1024;
const BLOB_LIMIT = 25 * 1024 * 1024;
const THUMB_LIMIT = 2 * 1024 * 1024;

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/**
 * Same-origin protection for a local server that any website could try to call:
 * - Host must be one of ours (blocks DNS rebinding),
 * - cross-site requests are refused (Origin / Sec-Fetch-Site),
 * - API calls must carry X-Sketchboard, which a cross-site page can't add without
 *   a CORS preflight that we never approve. Image and event-stream URLs can't set
 *   headers, so those reads are exempt but still same-origin only.
 */
export function createGuard(ports) {
  const hosts = new Set(ports.flatMap((p) => [`localhost:${p}`, `127.0.0.1:${p}`, `[::1]:${p}`]));
  const origins = new Set([...hosts].map((h) => `http://${h}`));
  return function guard(req, pathname) {
    if (!hosts.has(String(req.headers.host || "").toLowerCase())) return "unknown host";
    const origin = req.headers.origin;
    if (origin && origin !== "null" && !origins.has(origin)) return "cross-origin request";
    if (!pathname.startsWith("/api/")) return null;
    if (req.headers["sec-fetch-site"] === "cross-site") return "cross-site request";
    const headerless = req.method === "GET" && (/^\/api\/blobs\/[0-9a-f]{64}$/.test(pathname) || /\/thumb$/.test(pathname) || pathname === "/api/events");
    if (!headerless && req.headers["x-sketchboard"] !== "1") return "missing X-Sketchboard header";
    return null;
  };
}

async function readBody(req, limit) {
  const declared = Number(req.headers["content-length"] || 0);
  if (declared > limit) throw new HttpError(413, "request too large");
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > limit) throw new HttpError(413, "request too large");
    chunks.push(c);
  }
  return Buffer.concat(chunks);
}

async function readJson(req) {
  const buf = await readBody(req, JSON_LIMIT);
  if (!buf.length) return {};
  try {
    return JSON.parse(buf.toString("utf8"));
  } catch {
    throw new BadRequest("body must be JSON");
  }
}

function decodeThumb(dataUrl) {
  if (typeof dataUrl !== "string") return undefined;
  const m = /^data:image\/(webp|png|jpeg);base64,(.+)$/s.exec(dataUrl);
  if (!m) return undefined;
  const buf = Buffer.from(m[2], "base64");
  return buf.length <= THUMB_LIMIT ? buf : undefined;
}

const send = (res, status, body, headers = {}) => {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers });
  res.end(json);
};

const sendImage = (res, bytes, mime, cache) => {
  if (!bytes) return send(res, 404, { error: "no image" });
  res.writeHead(200, { "Content-Type": mime, "Content-Length": bytes.length, "Cache-Control": cache });
  res.end(Buffer.from(bytes));
};

export function createApi({ store, linker, backups, info }) {
  const routes = [];
  const route = (method, pattern, fn) => routes.push({ method, re: new RegExp(`^${pattern.replace(/:(\w+)/g, "(?<$1>[^/]+)")}$`), fn });
  const withFile = (m) => (m.linkedPath ? { ...m, fileState: linker.fileState(m.id) } : m);
  const safety = (p, reason) => store.addVersion(p.id, { kind: "safety", reason, doc: p.doc, force: true });

  route("GET", "/api/status", () => ({ ok: true, api: 1, ...info, counts: store.counts() }));

  // ---- projects ----
  route("GET", "/api/projects", ({ url }) =>
    store.listProjects({ q: url.searchParams.get("q") ?? "", trash: url.searchParams.get("trash") === "1", limit: Math.min(500, Number(url.searchParams.get("limit")) || 200) }).map(withFile),
  );
  route("POST", "/api/projects", async ({ req }) => {
    const body = await readJson(req);
    return [201, store.createProject({ name: body.name, doc: body.doc })];
  });
  route("GET", "/api/projects/:id", ({ p }) => withFile(store.getProject(p.id)));
  route("PUT", "/api/projects/:id", async ({ req, p }) => {
    const body = await readJson(req);
    return store.saveDoc(p.id, { baseRev: body.baseRev, doc: body.doc, thumb: decodeThumb(body.thumb), force: body.force === true, origin: body.clientId ?? null });
  });
  route("PATCH", "/api/projects/:id", async ({ req, p }) => withFile(store.patchProject(p.id, await readJson(req))));
  route("DELETE", "/api/projects/:id", ({ p, url }) => {
    if (url.searchParams.get("purge") === "1") {
      linker.unlink(p.id);
      store.purgeProject(p.id);
      return { ok: true };
    }
    return store.patchProject(p.id, { deleted: true });
  });
  route("POST", "/api/projects/:id/duplicate", ({ p }) => [201, store.duplicateProject(p.id)]);
  route("GET", "/api/projects/:id/thumb", ({ res, p }) => sendImage(res, store.getThumb(p.id), "image/webp", "no-cache"));
  route("PUT", "/api/projects/:id/thumb", async ({ req, p }) => {
    const thumb = decodeThumb((await readJson(req)).thumb);
    if (!thumb) throw new BadRequest("thumb must be a small webp/png/jpeg data URL");
    store.setThumb(p.id, thumb);
    return { ok: true };
  });
  route("GET", "/api/projects/:id/export", ({ res, p }) => {
    const proj = store.getProject(p.id);
    const name = `${proj.name.replace(/[^\w .-]+/g, "_") || "drawing"}.sketchboard.json`;
    const json = JSON.stringify(store.embed(proj.doc));
    res.writeHead(200, {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    });
    res.end(json);
  });

  // ---- versions ----
  route("GET", "/api/projects/:id/versions", ({ p }) => store.listVersions(p.id));
  route("POST", "/api/projects/:id/versions", async ({ req, p }) => {
    const b = await readJson(req);
    return [201, store.addVersion(p.id, { kind: b.kind, label: b.label, reason: b.reason, doc: b.doc, thumb: decodeThumb(b.thumb), force: b.force === true })];
  });
  route("GET", "/api/versions/:vid", ({ p }) => store.getVersion(p.vid));
  route("GET", "/api/versions/:vid/thumb", ({ res, p }) => sendImage(res, store.getVersionThumb(p.vid), "image/webp", "public, max-age=31536000, immutable"));
  route("PATCH", "/api/versions/:vid", async ({ req, p }) => store.patchVersion(p.vid, await readJson(req)));
  route("DELETE", "/api/versions/:vid", ({ p }) => {
    store.deleteVersion(p.vid);
    return { ok: true };
  });

  // ---- blobs ----
  route("POST", "/api/blobs", async ({ req }) => {
    const mime = String(req.headers["content-type"] || "").split(";")[0].trim();
    const hash = store.putBlob(await readBody(req, BLOB_LIMIT), mime);
    return [201, { hash, url: `/api/blobs/${hash}` }];
  });
  route("GET", "/api/blobs/:hash", ({ res, p }) => {
    if (!/^[0-9a-f]{64}$/.test(p.hash)) throw new BadRequest("bad hash");
    const b = store.getBlob(p.hash);
    return sendImage(res, b?.data, b?.mime, "public, max-age=31536000, immutable");
  });

  // ---- import ----
  route("POST", "/api/import", async ({ req }) => {
    const b = await readJson(req);
    return [201, store.createProject({ name: b.name, doc: b.doc })];
  });
  // One-time move of a browser's IndexedDB drawing, library, settings and history.
  // Each browser has its own old data, so each migrates once, identified by the
  // key it generated; a retry with the same key is a no-op.
  route("POST", "/api/import/browser", async ({ req }) => {
    const b = await readJson(req);
    if (typeof b.key !== "string" || !/^[\w-]{8,64}$/.test(b.key)) throw new BadRequest("migration key is required");
    const marker = `migrated:${b.key}`;
    const done = store.getSettings()[marker];
    if (done) return { skipped: true, project: done.projectId ? store.getMeta(done.projectId) : null };
    let project = null;
    if (b.doc) {
      project = store.createProject({ name: b.name || "My drawing", doc: b.doc });
      for (const v of Array.isArray(b.versions) ? b.versions : []) {
        try {
          store.addVersion(project.id, { kind: v.kind, label: v.label, reason: v.reason, doc: v.doc, created: v.created, force: true });
        } catch {
          // a damaged old version shouldn't block the rest
        }
      }
      store.patchProject(project.id, { opened: true });
    }
    if (Array.isArray(b.library) && b.library.length) {
      const have = new Set(store.getLibrary().map((i) => i.id));
      store.setLibrary([...b.library.filter((i) => !have.has(i?.id)), ...store.getLibrary()]);
    }
    // Old preferences only fill gaps: a second browser mustn't override what's set.
    const current = store.getSettings();
    const prefs = b.settings && typeof b.settings === "object" ? Object.fromEntries(Object.entries(b.settings).filter(([k]) => !(k in current))) : {};
    store.patchSettings({ ...prefs, [marker]: { at: Date.now(), projectId: project?.id ?? null } });
    return { project, versions: project ? store.listVersions(project.id).length : 0 };
  });

  // ---- library & settings ----
  route("GET", "/api/library", () => store.getLibrary());
  route("PUT", "/api/library", async ({ req }) => {
    store.setLibrary(await readJson(req));
    return { ok: true };
  });
  route("GET", "/api/settings", () => store.getSettings());
  route("PATCH", "/api/settings", async ({ req }) => store.patchSettings(await readJson(req)));

  // ---- folders & linked files ----
  route("GET", "/api/folders", () => store.listFolders());
  route("POST", "/api/folders", async ({ req }) => [201, store.addFolder(await checkFolder((await readJson(req)).path))]);
  route("DELETE", "/api/folders/:id", ({ p }) => {
    const f = store.getFolder(p.id);
    if (!f) throw new HttpError(404, "folder not found");
    for (const lp of store.linkedProjects()) if (lp.linked_path === f.path || lp.linked_path.startsWith(f.path + "/")) linker.unlink(lp.id);
    store.removeFolder(p.id);
    return { ok: true };
  });
  route("GET", "/api/folders/:id/scan", async ({ p }) => {
    const f = store.getFolder(p.id);
    if (!f) throw new HttpError(404, "folder not found");
    const { files, truncated } = await scanFolder(f.path);
    return { folder: f, truncated, files: files.map((x) => ({ ...x, projectId: store.projectBySource(x.path) })) };
  });
  route("POST", "/api/folders/:id/import", async ({ req, p }) => {
    const f = store.getFolder(p.id);
    if (!f) throw new HttpError(404, "folder not found");
    const b = await readJson(req);
    if (typeof b.rel !== "string") throw new BadRequest("rel is required");
    const { path } = await confinedPath(join(f.path, b.rel), [f.path]);
    const existing = store.projectBySource(path);
    if (existing) return store.getMeta(existing);
    const { doc, mtime } = await readSketchFile(path);
    const name = cleanName(path.split("/").pop().replace(/(\.sketchboard)?\.json$/i, ""));
    const meta = store.createProject({ name, doc, sourcePath: path });
    if (b.link) await linker.linkExisting(meta.id, path, mtime);
    return [201, withFile(store.getMeta(meta.id))];
  });
  route("POST", "/api/projects/:id/link", async ({ req, p }) => {
    const b = await readJson(req);
    return withFile(await linker.link(p.id, b.folderId, b.fileName, { overwrite: b.overwrite === true }));
  });
  route("DELETE", "/api/projects/:id/link", ({ p }) => {
    linker.unlink(p.id);
    return store.getMeta(p.id);
  });
  route("POST", "/api/projects/:id/link/resolve", async ({ req, p }) => {
    const { action } = await readJson(req);
    return linker.resolveChange(p.id, action, (proj) => safety(proj, "Before reloading from the linked file"));
  });

  // ---- backups ----
  route("GET", "/api/backups", () => ({ dir: backups.dir, backups: backups.list() }));
  route("POST", "/api/backups", () => [201, { path: backups.manual() }]);

  // ---- live updates ----
  route("GET", "/api/events", ({ req, res }) => {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
    res.write("retry: 2000\n\n");
    const onChange = (e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
    store.events.on("change", onChange);
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
    req.on("close", () => {
      clearInterval(ping);
      store.events.off("change", onChange);
    });
    return undefined;
  });

  return async function handleApi(req, res, url) {
    const match = routes.find((r) => r.method === req.method && r.re.test(url.pathname));
    if (!match) {
      const any = routes.some((r) => r.re.test(url.pathname));
      return send(res, any ? 405 : 404, { error: any ? "method not allowed" : "no such endpoint" });
    }
    const p = Object.fromEntries(Object.entries(url.pathname.match(match.re).groups ?? {}).map(([k, v]) => [k, decodeURIComponent(v)]));
    try {
      const out = await match.fn({ req, res, url, p });
      if (res.headersSent || out === undefined) return;
      const [status, body] = Array.isArray(out) && typeof out[0] === "number" ? out : [200, out];
      send(res, status, body ?? null);
    } catch (err) {
      const status = err.status ?? 500;
      if (status >= 500) console.error(`api ${req.method} ${url.pathname} failed:`, err);
      if (!res.headersSent) send(res, status, { error: status >= 500 ? "internal error" : err.message, ...(err.rev !== undefined ? { rev: err.rev } : {}), ...(err.code ? { code: err.code } : {}) });
      else res.end();
    }
  };
}

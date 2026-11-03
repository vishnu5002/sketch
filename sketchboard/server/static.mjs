// Static files from the Vite build, with compression, ETags and SPA fallback.
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize, sep } from "node:path";
import { brotliCompressSync, constants, gzipSync } from "node:zlib";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".map": "application/json; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".wasm": "application/wasm",
};
const COMPRESSIBLE = new Set([".html", ".js", ".mjs", ".css", ".json", ".webmanifest", ".map", ".txt", ".svg"]);

function pickEncoding(req, ext) {
  if (!COMPRESSIBLE.has(ext)) return null;
  const accept = String(req.headers["accept-encoding"] || "");
  if (/\bbr\b/.test(accept)) return "br";
  if (/\bgzip\b/.test(accept)) return "gzip";
  return null;
}

export function createStatic(dist) {
  // Compressed bodies are cached per file version, so each asset is compressed once.
  const cache = new Map();

  async function load(path, encoding) {
    const info = await stat(path);
    if (!info.isFile()) return null;
    const key = `${path}|${info.mtimeMs}|${info.size}|${encoding}`;
    let body = cache.get(key);
    if (!body) {
      const raw = await readFile(path);
      body = encoding === "br" ? brotliCompressSync(raw, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }) : encoding === "gzip" ? gzipSync(raw, { level: 9 }) : raw;
      cache.set(key, body);
    }
    return { body, etag: `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"` };
  }

  /** Map a URL path to a file inside dist, or null if it would escape it. */
  function toFile(urlPath) {
    let decoded;
    try {
      decoded = decodeURIComponent(urlPath);
    } catch {
      return null;
    }
    if (decoded.includes("\0")) return null;
    const file = normalize(join(dist, decoded));
    return file === dist || file.startsWith(dist + sep) ? file : null;
  }

  return async function serveStatic(req, res, pathname) {
    if (req.method !== "GET" && req.method !== "HEAD") {
      res.writeHead(405, { Allow: "GET, HEAD" }).end();
      return;
    }
    let file = toFile(pathname.endsWith("/") ? pathname + "index.html" : pathname);
    if (!file) {
      res.writeHead(400).end();
      return;
    }
    let ext = extname(file).toLowerCase();
    let encoding = pickEncoding(req, ext);
    let found = await load(file, encoding).catch(() => null);
    // Single-page app: unknown extension-less routes get the app shell.
    if (!found && !ext) {
      file = join(dist, "index.html");
      ext = ".html";
      encoding = pickEncoding(req, ext);
      found = await load(file, encoding).catch(() => null);
    }
    if (!found) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    const headers = {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      ETag: found.etag,
      Vary: "Accept-Encoding",
      // Vite fingerprints everything under /assets, so those never change.
      "Cache-Control": pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : ext === ".html" ? "no-cache" : "public, max-age=3600",
    };
    if (encoding) headers["Content-Encoding"] = encoding;
    if (req.headers["if-none-match"] === found.etag) {
      res.writeHead(304, headers).end();
      return;
    }
    headers["Content-Length"] = found.body.length;
    res.writeHead(200, headers);
    res.end(req.method === "HEAD" ? undefined : found.body);
  };
}

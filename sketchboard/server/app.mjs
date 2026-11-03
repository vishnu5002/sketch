// Assembles the local service: database, API, linked files, backups and static files.
import { createServer } from "node:http";
import { stat } from "node:fs/promises";
import { join } from "node:path";
import { createApi, createGuard } from "./api.mjs";
import { createBackups } from "./backup.mjs";
import { openDatabase } from "./db.mjs";
import { createLinker } from "./folders.mjs";
import { createStatic } from "./static.mjs";
import { createStore } from "./store.mjs";

/**
 * @param {object} o
 * @param {number} o.port
 * @param {string[]} [o.hosts]       addresses to bind (default: both loopbacks)
 * @param {string} o.dataDir         holds sketchboard.db and backups/
 * @param {string|null} [o.dist]     built app to serve; null = API only (dev)
 * @param {number[]} [o.extraPorts]  other ports allowed in Host/Origin (the dev server's)
 * @param {boolean} [o.backups]
 */
export async function startServer({ port, hosts = ["127.0.0.1", "::1"], dataDir, dist = null, extraPorts = [], backups: runBackups = true, log = console }) {
  if (dist) await stat(join(dist, "index.html")).catch(() => {
    throw new Error(`no build found at ${dist} — run "npm run build" first`);
  });
  const dbPath = join(dataDir, "sketchboard.db");
  const db = openDatabase(dbPath);
  const store = createStore(db);
  const linker = createLinker(store, log);
  const backups = createBackups(db, join(dataDir, "backups"), log);
  store.purgeOldTrash();
  store.collectGarbage();
  if (runBackups) backups.start();

  const guard = createGuard([port, ...extraPorts]);
  const handleApi = createApi({ store, linker, backups, info: { dataDir, dbPath, backupsDir: backups.dir } });
  const serveStatic = dist ? createStatic(dist) : null;

  async function onRequest(req, res) {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    const url = new URL(req.url || "/", "http://localhost");
    const denied = guard(req, url.pathname);
    if (denied) {
      res.writeHead(403, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify({ error: denied }));
      return;
    }
    if (url.pathname === "/healthz") {
      res.writeHead(200, { "Content-Type": "text/plain", "Cache-Control": "no-store" }).end("ok");
      return;
    }
    if (url.pathname.startsWith("/api/")) return handleApi(req, res, url);
    if (serveStatic) return serveStatic(req, res, url.pathname);
    res.writeHead(404).end();
  }

  const servers = [];
  for (const host of hosts) {
    try {
      servers.push(
        await new Promise((ok, fail) => {
          const s = createServer((req, res) =>
            onRequest(req, res).catch((err) => {
              log.error("request failed:", req.url, err);
              if (!res.headersSent) res.writeHead(500);
              res.end();
            }),
          );
          s.once("error", fail);
          s.listen(port, host, () => ok(s));
        }),
      );
    } catch (err) {
      // A machine without IPv6 just serves 127.0.0.1; any other failure is fatal.
      if (host === "::1" && hosts.length > 1 && err.code === "EADDRNOTAVAIL") continue;
      throw new Error(`cannot listen on ${host}:${port} — ${err.message}`);
    }
  }

  async function close() {
    await linker.flush().catch(() => undefined);
    await Promise.all(servers.map((s) => new Promise((r) => (s.closeAllConnections?.(), s.close(r)))));
    db.close();
  }

  return { store, linker, backups, db, dbPath, close, port };
}

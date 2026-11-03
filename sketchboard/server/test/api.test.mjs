// API and security tests against a real server on a temporary database.
//   npm run test:api
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync, symlinkSync, existsSync } from "node:fs";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../app.mjs";
import { versionsToPrune } from "../docs.mjs";

const PORT = 5000 + Math.floor(Math.random() * 3000);
const root = mkdtempSync(join(tmpdir(), "sketchboard-test-"));
const dataDir = join(root, "data");
const drawings = join(root, "drawings");
let app;

const quiet = { log: () => {}, error: () => {} };

/** Raw HTTP so tests control every header (fetch forbids setting Host/Origin). */
function http(method, path, { body, headers = {}, raw } = {}) {
  return new Promise((resolve, reject) => {
    const payload = raw ?? (body === undefined ? undefined : Buffer.from(JSON.stringify(body)));
    const req = request(
      {
        host: "127.0.0.1",
        port: PORT,
        method,
        path,
        headers: {
          Host: `localhost:${PORT}`,
          "X-Sketchboard": "1",
          ...(payload && !raw ? { "Content-Type": "application/json" } : {}),
          ...(payload ? { "Content-Length": payload.length } : {}),
          ...headers,
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const buf = Buffer.concat(chunks);
          let json = null;
          try {
            json = JSON.parse(buf.toString("utf8"));
          } catch {
            // not JSON
          }
          resolve({ status: res.statusCode, headers: res.headers, json, buf });
        });
      },
    );
    req.on("error", reject);
    if (payload) req.write(payload);
    req.end();
  });
}

const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const el = (id, extra = {}) => ({ id, type: "rectangle", x: 0, y: 0, width: 10, height: 10, ...extra });
const doc = (elements, extra = {}) => ({ type: "sketchboard", version: 2, pages: [{ id: "p1", name: "Page 1", elements }], activePageId: "p1", ...extra });

before(async () => {
  mkdirSync(join(drawings, "sub"), { recursive: true });
  writeFileSync(join(drawings, "a.sketchboard.json"), JSON.stringify(doc([el("x", { type: "text", text: "Quarterly roadmap" })])));
  writeFileSync(join(drawings, "sub", "b.json"), JSON.stringify(doc([el("y")])));
  writeFileSync(join(drawings, "other.json"), JSON.stringify({ hello: "world" }));
  app = await startServer({ port: PORT, hosts: ["127.0.0.1"], dataDir, backups: false, log: quiet });
});

after(async () => {
  await app.close();
  rmSync(root, { recursive: true, force: true });
});

describe("security", () => {
  test("unknown Host is refused (DNS rebinding)", async () => {
    const r = await http("GET", "/api/projects", { headers: { Host: `evil.example:${PORT}` } });
    assert.equal(r.status, 403);
    const s = await http("GET", "/", { headers: { Host: "attacker.test" } });
    assert.equal(s.status, 403, "static files too");
  });

  test("API calls need the X-Sketchboard header", async () => {
    const r = await http("GET", "/api/projects", { headers: { "X-Sketchboard": "" } });
    assert.equal(r.status, 403);
    const w = await http("POST", "/api/projects", { body: {}, headers: { "X-Sketchboard": "0" } });
    assert.equal(w.status, 403);
  });

  test("foreign Origin and cross-site fetches are refused", async () => {
    assert.equal((await http("POST", "/api/projects", { body: {}, headers: { Origin: "https://evil.example" } })).status, 403);
    assert.equal((await http("GET", "/api/projects", { headers: { "Sec-Fetch-Site": "cross-site" } })).status, 403);
    assert.equal((await http("POST", "/api/projects", { body: { name: "ok" }, headers: { Origin: `http://localhost:${PORT}` } })).status, 201);
  });

  test("image URLs work without the header but never cross-site", async () => {
    const up = await http("POST", "/api/blobs", { raw: Buffer.from(PNG_1PX, "base64"), headers: { "Content-Type": "image/png" } });
    assert.equal(up.status, 201);
    const ok = await http("GET", up.json.url, { headers: { "X-Sketchboard": "" } });
    assert.equal(ok.status, 200);
    assert.equal(ok.headers["content-type"], "image/png");
    const xs = await http("GET", up.json.url, { headers: { "X-Sketchboard": "", "Sec-Fetch-Site": "cross-site" } });
    assert.equal(xs.status, 403);
  });

  test("oversized bodies are rejected", async () => {
    const r = await http("POST", "/api/blobs", { raw: Buffer.alloc(26 * 1024 * 1024), headers: { "Content-Type": "image/png" } });
    assert.equal(r.status, 413);
  });

  test("non-image blobs are rejected", async () => {
    const r = await http("POST", "/api/blobs", { raw: Buffer.from("<script>"), headers: { "Content-Type": "text/html" } });
    assert.equal(r.status, 400);
  });
});

describe("projects", () => {
  let id;
  test("create, read, list", async () => {
    const c = await http("POST", "/api/projects", { body: { name: "  Roadmap   2025 ", doc: doc([el("a")]) } });
    assert.equal(c.status, 201);
    assert.equal(c.json.name, "Roadmap 2025");
    assert.equal(c.json.rev, 1);
    id = c.json.id;
    const g = await http("GET", `/api/projects/${id}`);
    assert.equal(g.json.doc.pages[0].elements.length, 1);
    const l = await http("GET", "/api/projects");
    assert.ok(l.json.some((p) => p.id === id));
  });

  test("save needs the current revision; stale saves get 409", async () => {
    const ok = await http("PUT", `/api/projects/${id}`, { body: { baseRev: 1, doc: doc([el("a"), el("b")]) } });
    assert.deepEqual(ok.json, { rev: 2 });
    const stale = await http("PUT", `/api/projects/${id}`, { body: { baseRev: 1, doc: doc([el("c")]) } });
    assert.equal(stale.status, 409);
    assert.equal(stale.json.rev, 2);
    const forced = await http("PUT", `/api/projects/${id}`, { body: { baseRev: 1, force: true, doc: doc([el("a"), el("b")]) } });
    assert.equal(forced.json.rev, 3);
  });

  test("viewport-only saves don't count as edits", async () => {
    const before = (await http("GET", `/api/projects/${id}`)).json.updated;
    await new Promise((r) => setTimeout(r, 15));
    const d = doc([el("a"), el("b")]);
    d.pages[0].viewport = { scrollX: 100, scrollY: 50, zoom: 2 };
    const r = await http("PUT", `/api/projects/${id}`, { body: { baseRev: 3, doc: d } });
    assert.equal(r.json.rev, 4);
    const after = (await http("GET", `/api/projects/${id}`)).json;
    assert.equal(after.updated, before);
    assert.deepEqual(after.doc.pages[0].viewport, { scrollX: 100, scrollY: 50, zoom: 2 });
  });

  test("invalid documents are rejected", async () => {
    for (const bad of [{}, { pages: [] }, { pages: [{ id: 1, elements: [] }] }, { pages: [{ id: "p", elements: "x" }] }]) {
      const r = await http("PUT", `/api/projects/${id}`, { body: { baseRev: 4, doc: bad } });
      assert.equal(r.status, 400, JSON.stringify(bad));
    }
    assert.equal((await http("PUT", "/api/projects/nope", { body: { baseRev: 1, doc: doc([]) } })).status, 404);
  });

  test("rename, pin, open, trash, restore, purge", async () => {
    const r = await http("PATCH", `/api/projects/${id}`, { body: { name: "Roadmap v2", pinned: true, opened: true } });
    assert.equal(r.json.name, "Roadmap v2");
    assert.equal(r.json.pinned, true);
    assert.ok(r.json.opened);
    await http("DELETE", `/api/projects/${id}`);
    assert.ok(!(await http("GET", "/api/projects")).json.some((p) => p.id === id));
    assert.ok((await http("GET", "/api/projects?trash=1")).json.some((p) => p.id === id));
    await http("PATCH", `/api/projects/${id}`, { body: { deleted: false } });
    assert.ok((await http("GET", "/api/projects")).json.some((p) => p.id === id));
    const dup = await http("POST", `/api/projects/${id}/duplicate`);
    assert.equal(dup.json.name, "Roadmap v2 copy");
    await http("DELETE", `/api/projects/${dup.json.id}?purge=1`);
    assert.equal((await http("GET", `/api/projects/${dup.json.id}`)).status, 404);
  });

  test("thumbnails", async () => {
    const t = `data:image/png;base64,${PNG_1PX}`;
    await http("PUT", `/api/projects/${id}/thumb`, { body: { thumb: t } });
    const g = await http("GET", `/api/projects/${id}/thumb`, { headers: { "X-Sketchboard": "" } });
    assert.equal(g.status, 200);
    assert.equal((await http("PUT", `/api/projects/${id}/thumb`, { body: { thumb: "javascript:alert(1)" } })).status, 400);
  });
});

describe("images", () => {
  test("embedded images become shared blobs, and export embeds them again", async () => {
    const data = `data:image/png;base64,${PNG_1PX}`;
    const c = await http("POST", "/api/import", { body: { name: "with images", doc: doc([el("i1", { type: "image", src: data }), el("i2", { type: "image", src: data })]) } });
    const p = (await http("GET", `/api/projects/${c.json.id}`)).json;
    const srcs = p.doc.pages[0].elements.map((e) => e.src);
    assert.match(srcs[0], /^\/api\/blobs\/[0-9a-f]{64}$/);
    assert.equal(srcs[0], srcs[1], "same image stored once");
    const ex = await http("GET", `/api/projects/${c.json.id}/export`);
    assert.match(ex.headers["content-disposition"], /with images\.sketchboard\.json/);
    const exported = JSON.parse(ex.buf.toString("utf8"));
    assert.equal(exported.pages[0].elements[0].src, data, "round-trips to the original data URL");
  });

  test("unreferenced blobs are garbage-collected", async () => {
    const c = await http("POST", "/api/import", { body: { name: "temp", doc: doc([el("i", { type: "image", src: `data:image/gif;base64,R0lGODlhAQABAAAAACw=` })]) } });
    const before = (await http("GET", "/api/status")).json.counts.blobs;
    await http("DELETE", `/api/projects/${c.json.id}?purge=1`);
    const after = (await http("GET", "/api/status")).json.counts.blobs;
    assert.equal(after, before - 1);
  });
});

describe("search", () => {
  test("finds names and text inside drawings, with prefix matching", async () => {
    await http("POST", "/api/projects", { body: { name: "Policy notes", doc: doc([el("t", { type: "text", text: "Group relative policy optimisation" })]) } });
    const r = await http("GET", `/api/projects?q=${encodeURIComponent("relat optim")}`);
    assert.equal(r.json.length, 1);
    assert.match(r.json[0].snippet, /\[\[relative\]\]/);
    const byName = await http("GET", "/api/projects?q=polic");
    assert.ok(byName.json.some((p) => p.name === "Policy notes"));
    const odd = await http("GET", `/api/projects?q=${encodeURIComponent('"*(): ^')}`);
    assert.equal(odd.status, 200, "FTS syntax in queries can't break the search");
  });
});

describe("versions", () => {
  let id;
  before(async () => {
    id = (await http("POST", "/api/projects", { body: { name: "history" } })).json.id;
  });

  test("snapshots, dedupe, naming and safety promotion", async () => {
    const a = await http("POST", `/api/projects/${id}/versions`, { body: { kind: "auto", doc: doc([el("a")]) } });
    assert.equal(a.status, 201);
    assert.equal(a.json.summary, "1 element on 1 page");
    const same = await http("POST", `/api/projects/${id}/versions`, { body: { kind: "safety", reason: "before X", doc: doc([el("a")]) } });
    assert.equal(same.json.id, a.json.id, "identical snapshot collapses");
    assert.equal(same.json.kind, "safety");
    const b = await http("POST", `/api/projects/${id}/versions`, { body: { kind: "auto", doc: doc([el("a", { x: 5 }), el("b")]) } });
    assert.equal(b.json.summary, "+1 · 1 edited — Page 1");
    const named = await http("PATCH", `/api/versions/${b.json.id}`, { body: { label: "Milestone" } });
    assert.equal(named.json.kind, "named");
    const list = (await http("GET", `/api/projects/${id}/versions`)).json;
    assert.equal(list.length, 2);
    const full = await http("GET", `/api/versions/${b.json.id}`);
    assert.equal(full.json.doc.pages[0].elements.length, 2);
    await http("DELETE", `/api/versions/${a.json.id}`);
    assert.equal((await http("GET", `/api/projects/${id}/versions`)).json.length, 1);
  });

  test("empty drawings aren't snapshotted unless forced", async () => {
    const r = await http("POST", `/api/projects/${id}/versions`, { body: { kind: "auto", doc: doc([]) } });
    assert.equal(r.json, null);
  });

  test("thinning policy", () => {
    const now = Date.parse("2026-11-03T12:00:00Z");
    const H = 3_600_000;
    const D = 24 * H;
    const vs = [
      { id: "old-auto-1", kind: "auto", created: now - 40 * D },
      { id: "old-auto-2", kind: "auto", created: now - 40 * D + H },
      { id: "named-old", kind: "named", created: now - 400 * D },
      { id: "safety-old", kind: "safety", created: now - 10 * D },
      { id: "safety-new", kind: "safety", created: now - 2 * D },
      { id: "min-1", kind: "auto", created: now - 20 * 60_000 },
      { id: "min-2", kind: "auto", created: now - 19 * 60_000 },
      { id: "latest", kind: "auto", created: now - 1000 },
    ];
    const drop = versionsToPrune(vs, now);
    assert.ok(drop.includes("old-auto-1") && !drop.includes("old-auto-2"), "one per week bucket");
    assert.ok(!drop.includes("named-old"), "named kept forever");
    assert.ok(!drop.includes("safety-new"), "recent safety kept");
    assert.ok(!drop.includes("latest"));
    assert.ok(drop.includes("min-1") && !drop.includes("min-2"), "one per 5-minute bucket");
  });
});

describe("library, settings, migration", () => {
  test("library round-trips and externalizes images", async () => {
    const items = [{ id: "l1", name: "logo", created: 1, elements: [el("i", { type: "image", src: `data:image/png;base64,${PNG_1PX}` })] }];
    await http("PUT", "/api/library", { body: items });
    const back = (await http("GET", "/api/library")).json;
    assert.equal(back[0].name, "logo");
    assert.match(back[0].elements[0].src, /^\/api\/blobs\//);
  });

  test("settings merge and delete keys", async () => {
    await http("PATCH", "/api/settings", { body: { theme: "dark", gridEnabled: true } });
    const s = (await http("PATCH", "/api/settings", { body: { gridEnabled: null } })).json;
    assert.equal(s.theme, "dark");
    assert.ok(!("gridEnabled" in s));
  });

  test("browser migration runs once per browser, keeping history with original times", async () => {
    const t0 = Date.parse("2026-10-01T10:00:00Z");
    const body = {
      key: "browser-one-key",
      name: "Old drawing",
      doc: doc([el("a"), el("b")]),
      versions: [
        { kind: "auto", created: t0, doc: doc([el("a")]) },
        { kind: "named", label: "Kept", created: t0 + 60_000, doc: doc([el("a"), el("b")]) },
      ],
      library: [],
      settings: { theme: "light" },
    };
    const r = await http("POST", "/api/import/browser", { body });
    assert.equal(r.json.project.name, "Old drawing");
    const vs = (await http("GET", `/api/projects/${r.json.project.id}/versions`)).json;
    assert.equal(vs.length, 2);
    assert.equal(vs[0].created, t0);
    assert.equal(vs[1].label, "Kept");
    const again = await http("POST", "/api/import/browser", { body });
    assert.equal(again.json.skipped, true);
    assert.equal(again.json.project.id, r.json.project.id, "a retry with the same key is a no-op");
    // A different browser still gets its own drawing moved, but can't override settings.
    const other = await http("POST", "/api/import/browser", { body: { ...body, key: "browser-two-key", name: "Chrome drawing", settings: { theme: "light", snapEnabled: false } } });
    assert.equal(other.json.project.name, "Chrome drawing");
    const settings = (await http("GET", "/api/settings")).json;
    assert.equal(settings.theme, "dark", "existing preference kept");
    assert.equal(settings.snapEnabled, false, "missing preference filled in");
    assert.equal((await http("POST", "/api/import/browser", { body: { name: "x" } })).status, 400, "key required");
  });
});

describe("folders and linked files", () => {
  let folder;
  test("register only real, specific folders", async () => {
    assert.equal((await http("POST", "/api/folders", { body: { path: join(root, "missing") } })).status, 400);
    assert.equal((await http("POST", "/api/folders", { body: { path: "/" } })).status, 400);
    assert.equal((await http("POST", "/api/folders", { body: { path: "relative/path" } })).status, 400);
    const r = await http("POST", "/api/folders", { body: { path: drawings } });
    assert.equal(r.status, 201);
    folder = r.json;
  });

  test("scan finds sketchboard files only", async () => {
    const r = await http("GET", `/api/folders/${folder.id}/scan`);
    assert.deepEqual(r.json.files.map((f) => f.rel).sort(), ["a.sketchboard.json", join("sub", "b.json")]);
  });

  test("import can't escape the folder", async () => {
    for (const rel of ["../data/sketchboard.db", "/etc/passwd", "sub/../../x.json"]) {
      const r = await http("POST", `/api/folders/${folder.id}/import`, { body: { rel } });
      assert.ok(r.status === 403 || r.status === 400 || r.status === 404, `${rel} → ${r.status}`);
    }
    // a symlink inside the folder that points outside it is refused too
    symlinkSync(join(dataDir, "sketchboard.db"), join(drawings, "link.json"));
    const s = await http("POST", `/api/folders/${folder.id}/import`, { body: { rel: "link.json" } });
    assert.equal(s.status, 403);
  });

  let linked;
  test("import & link, then saves rewrite the file", async () => {
    const r = await http("POST", `/api/folders/${folder.id}/import`, { body: { rel: "a.sketchboard.json", link: true } });
    assert.equal(r.status, 201);
    linked = r.json;
    assert.equal(linked.name, "a");
    assert.ok(linked.linkedPath.endsWith("a.sketchboard.json"));
    const again = await http("POST", `/api/folders/${folder.id}/import`, { body: { rel: "a.sketchboard.json" } });
    assert.equal(again.json.id, linked.id, "importing the same file twice returns the same project");
    await http("PUT", `/api/projects/${linked.id}`, { body: { baseRev: linked.rev, doc: doc([el("x", { type: "text", text: "Updated roadmap" })]) } });
    await new Promise((r) => setTimeout(r, 1200));
    const onDisk = JSON.parse(readFileSync(join(drawings, "a.sketchboard.json"), "utf8"));
    assert.equal(onDisk.pages[0].elements[0].text, "Updated roadmap");
  });

  test("outside edits are detected and never overwritten; reload keeps a safety copy", async () => {
    const file = join(drawings, "a.sketchboard.json");
    await new Promise((r) => setTimeout(r, 20));
    writeFileSync(file, JSON.stringify(doc([el("x", { type: "text", text: "Edited in git" })])));
    await app.linker.poll();
    assert.equal(app.linker.fileState(linked.id), "changed");
    const cur = (await http("GET", `/api/projects/${linked.id}`)).json;
    assert.equal(cur.fileState, "changed");
    await http("PUT", `/api/projects/${linked.id}`, { body: { baseRev: cur.rev, doc: doc([el("x", { type: "text", text: "App edit" })]) } });
    await new Promise((r) => setTimeout(r, 1200));
    assert.match(readFileSync(file, "utf8"), /Edited in git/, "file left alone while changed");
    const rel = await http("POST", `/api/projects/${linked.id}/link/resolve`, { body: { action: "reload" } });
    assert.equal(rel.status, 200);
    const after = (await http("GET", `/api/projects/${linked.id}`)).json;
    assert.equal(after.doc.pages[0].elements[0].text, "Edited in git");
    const vs = (await http("GET", `/api/projects/${linked.id}/versions`)).json;
    const safety = (await http("GET", `/api/versions/${vs.at(-1).id}`)).json;
    assert.equal(safety.doc.pages[0].elements[0].text, "App edit");
  });

  test("link to a new file, refuse overwriting, reject bad names", async () => {
    const p = (await http("POST", "/api/projects", { body: { name: "fresh", doc: doc([el("z")]) } })).json;
    const ok = await http("POST", `/api/projects/${p.id}/link`, { body: { folderId: folder.id, fileName: "fresh" } });
    assert.equal(ok.status, 200);
    assert.ok(existsSync(join(drawings, "fresh.sketchboard.json")));
    const exists = await http("POST", `/api/projects/${p.id}/link`, { body: { folderId: folder.id, fileName: "sub/b.json" } });
    assert.equal(exists.status, 409);
    assert.equal(exists.json.code, "exists");
    for (const fileName of ["../escape.json", "sub/../../x.json", ""]) {
      const r = await http("POST", `/api/projects/${p.id}/link`, { body: { folderId: folder.id, fileName } });
      assert.equal(r.status, 400, fileName);
    }
    const un = await http("DELETE", `/api/projects/${p.id}/link`);
    assert.equal(un.json.linkedPath, null);
    assert.ok(existsSync(join(drawings, "fresh.sketchboard.json")), "unlinking leaves the file");
  });

  test("missing linked files are reported", async () => {
    rmSync(join(drawings, "a.sketchboard.json"));
    await app.linker.poll();
    assert.equal(app.linker.fileState(linked.id), "missing");
  });
});

describe("backups", () => {
  test("manual backup is a complete, consistent database copy", async () => {
    const r = await http("POST", "/api/backups");
    assert.equal(r.status, 201);
    assert.ok(statSync(r.json.path).size > 0);
    const { DatabaseSync } = await import("node:sqlite");
    const copy = new DatabaseSync(r.json.path, { readOnly: true });
    const n = copy.prepare("SELECT COUNT(*) AS n FROM projects").get().n;
    copy.close();
    assert.ok(n >= 3);
    const list = (await http("GET", "/api/backups")).json;
    assert.ok(list.backups.some((b) => b.manual));
  });

  test("daily backup happens once per day", () => {
    const first = app.backups.daily(new Date("2026-11-03T09:00:00"));
    const second = app.backups.daily(new Date("2026-11-03T21:00:00"));
    assert.ok(first);
    assert.equal(second, null);
  });
});

describe("static and misc", () => {
  test("unknown API routes and methods", async () => {
    assert.equal((await http("GET", "/api/nope")).status, 404);
    assert.equal((await http("DELETE", "/api/status")).status, 405);
    assert.equal((await http("GET", "/healthz")).buf.toString(), "ok");
  });

  test("bad JSON is a 400, not a crash", async () => {
    const r = await http("POST", "/api/projects", { raw: Buffer.from("{nope"), headers: { "Content-Type": "application/json" } });
    assert.equal(r.status, 400);
  });
});

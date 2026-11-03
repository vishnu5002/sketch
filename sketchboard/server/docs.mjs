// Pure helpers for drawing documents: validation, hashing, search text, change summaries, version thinning.
import { createHash } from "node:crypto";

export const BLOB_URL = /\/api\/blobs\/([0-9a-f]{64})/g;

export class BadRequest extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

/** Accept a DocumentFile-shaped object, normalised to what we store. */
export function validateDoc(doc) {
  if (!doc || typeof doc !== "object" || !Array.isArray(doc.pages) || doc.pages.length === 0) throw new BadRequest("doc must have at least one page");
  if (doc.pages.length > 500) throw new BadRequest("too many pages");
  const pages = doc.pages.map((p) => {
    if (!p || typeof p.id !== "string" || !Array.isArray(p.elements)) throw new BadRequest("each page needs an id and an elements array");
    return { ...p, name: typeof p.name === "string" ? p.name.slice(0, 200) : "Page" };
  });
  const activePageId = pages.some((p) => p.id === doc.activePageId) ? doc.activePageId : pages[0].id;
  return { type: "sketchboard", version: 2, pages, activePageId, ...(typeof doc.canvasBg === "string" ? { canvasBg: doc.canvasBg } : {}) };
}

export const elementCount = (doc) => doc.pages.reduce((n, p) => n + p.elements.length, 0);

export function docHash(doc) {
  return createHash("sha256")
    .update(JSON.stringify(doc.pages.map((p) => [p.id, p.name, p.elements])) + (doc.canvasBg ?? ""))
    .digest("hex")
    .slice(0, 32);
}

/** Everything a person might search for: page names, frame names and all text. */
export function searchBody(doc) {
  const parts = [];
  for (const p of doc.pages) {
    parts.push(p.name);
    for (const e of p.elements) {
      if (typeof e.text === "string" && e.text) parts.push(e.text);
      if (typeof e.name === "string" && e.name) parts.push(e.name);
    }
  }
  return parts.join("\n").slice(0, 500_000);
}

export function blobRefs(text) {
  return new Set([...text.matchAll(BLOB_URL)].map((m) => m[1]));
}

export function cleanName(name, fallback = "Untitled drawing") {
  const n = typeof name === "string" ? name.replace(/\s+/g, " ").trim().slice(0, 120) : "";
  return n || fallback;
}

const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;

/** Short human description of what changed between two documents. */
export function summarize(prev, next) {
  const total = elementCount(next);
  if (!prev) return `${plural(total, "element")} on ${plural(next.pages.length, "page")}`;
  const before = new Map(prev.pages.flatMap((p) => p.elements.map((e) => [e.id, JSON.stringify(e)])));
  const prevPageIds = new Set(prev.pages.map((p) => p.id));
  let added = 0;
  let edited = 0;
  const touched = [];
  const seen = new Set();
  for (const p of next.pages) {
    let pageChanged = !prevPageIds.has(p.id);
    for (const e of p.elements) {
      seen.add(e.id);
      const old = before.get(e.id);
      if (old === undefined) {
        added++;
        pageChanged = true;
      } else if (old !== JSON.stringify(e)) {
        edited++;
        pageChanged = true;
      }
    }
    const prevPage = prev.pages.find((x) => x.id === p.id);
    if (prevPage && prevPage.elements.some((e) => !p.elements.some((x) => x.id === e.id))) pageChanged = true;
    if (pageChanged) touched.push(p.name);
  }
  const removed = [...before.keys()].filter((id) => !seen.has(id)).length;
  const parts = [added && `+${added}`, removed && `−${removed}`, edited && `${edited} edited`].filter(Boolean);
  const removedPages = prev.pages.filter((p) => !next.pages.some((x) => x.id === p.id)).map((p) => p.name);
  if (removedPages.length) parts.push(`removed ${removedPages.join(", ")}`);
  if (!parts.length) return "No content changes";
  return parts.join(" · ") + (touched.length ? ` — ${touched.slice(0, 3).join(", ")}${touched.length > 3 ? "…" : ""}` : "");
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
export const AUTO_INTERVAL = 5 * MIN;
const MAX_AUTO = 300;

/**
 * Which versions to drop: automatic ones are thinned to every 5 min for the last hour,
 * hourly for a day, daily for a month, weekly after. Named ones stay forever, safety
 * copies at least a week, and the newest version always stays.
 */
export function versionsToPrune(versions, now = Date.now()) {
  const sorted = [...versions].sort((a, b) => a.created - b.created);
  const latest = sorted.at(-1)?.id;
  const buckets = new Map();
  for (const v of sorted) {
    if (v.kind === "named") continue;
    const age = now - v.created;
    if (v.kind === "safety" && age < 7 * DAY) continue;
    const key =
      age < HOUR
        ? `m${Math.floor(v.created / AUTO_INTERVAL)}`
        : age < DAY
          ? `h${Math.floor(v.created / HOUR)}`
          : age < 30 * DAY
            ? `d${Math.floor(v.created / DAY)}`
            : `w${Math.floor(v.created / (7 * DAY))}`;
    buckets.set(key, v.id);
  }
  const keepAuto = new Set(buckets.values());
  let kept = sorted.filter((v) => v.kind === "named" || v.id === latest || keepAuto.has(v.id) || (v.kind === "safety" && now - v.created < 7 * DAY));
  const autos = kept.filter((v) => v.kind !== "named");
  if (autos.length > MAX_AUTO) {
    const drop = new Set(autos.slice(0, autos.length - MAX_AUTO).map((v) => v.id));
    kept = kept.filter((v) => !drop.has(v.id));
  }
  const keep = new Set(kept.map((v) => v.id));
  return sorted.filter((v) => !keep.has(v.id)).map((v) => v.id);
}

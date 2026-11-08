# Generating hand-drawn diagrams for sketchboard from code — a complete guide

This guide teaches how to produce multi-page, hand-drawn-looking explanatory drawings (architecture
diagrams, flowcharts, sequence diagrams, swimlanes, tables, line and bar charts) for **sketchboard**, an
Excalidraw-style whiteboard app, **entirely from a script**. Nothing is drawn by hand. It is written for an
LLM agent that can read code, run shell commands and (ideally) drive a browser.

It contains every piece of code needed: the element library, the diagram kit, a minimal example, the import /
update / layout-check tools, and one complete real generator (a 14-page drawing) as a reference.

---

## 1. The idea in one paragraph

A sketchboard drawing is a JSON file: a list of pages, each a flat list of elements (rectangles, ellipses,
diamonds, text, arrows, lines, frames) with absolute coordinates. A Node script computes those coordinates
and writes the JSON. The app's renderer supplies the hand-drawn look — each element stores a `roughness`, a
random `seed` and a font like `Excalifont`, and the app wobbles the strokes deterministically from the seed.
So the job is: **understand the subject → decide the layout → emit elements at exact coordinates → import →
check visually → fix → regenerate.**

```
research the subject ──► generator script (gen-*.cjs) ──► drawing.sketchboard.json
                              │ uses kit.cjs + lib.cjs              │
                              ▼                                     ▼
                     deterministic output              POST /api/import  (or Home → Open file…)
                                                                    │
                                    browser: open #/p/<id>, run the layout check, screenshot, fix, PUT again
```

---

## 2. Setup

- **sketchboard** (in this repo: `sketchboard/`) is a Vite + React front end and a Node API server.
  - Dev: `bash sketchboard/run-dev.sh` → front end on **:5184**, API on :5185 (proxied under `/api`). The dev
    API uses its own database (`~/.local/share/sketchboard/dev`), separate from real drawings.
  - Node 22 on PATH (or `$HOME/.local/share/sketchboard/node/bin`).
- **API calls must carry the header `X-Sketchboard: 1`**, or the server answers `missing X-Sketchboard header`
  (a guard against cross-site requests).
- Routes you need:
  - `POST /api/import` `{name, doc}` → `{id, …}` — creates a drawing.
  - `PUT /api/projects/<id>` `{doc, force: true}` → `{rev}` — replaces a drawing's contents (keeps its id).
  - `GET /api/projects` — lists drawings; `GET /api/projects/<id>` — one drawing with its `doc`.
  - `PATCH /api/projects/<id>` `{name}` — rename.
- A drawing opens at `http://localhost:5184/#/p/<id>`.

---

## 3. The file format

```jsonc
{
  "type": "sketchboard", "version": 2,
  "activePageId": "rv-0",
  "canvasBg": "#fbfcfd",
  "pages": [ { "id": "rv-0", "name": "0 · Overview", "elements": [ /* … */ ] } ]
}
```

Every element has: `id, type, x, y, width, height, angle, strokeColor, backgroundColor, fillStyle,
strokeWidth, strokeStyle, roughness, roundness, opacity, seed, groupId`, optional `link, locked, frameId`.

| type | extra fields |
| --- | --- |
| `rectangle` / `diamond` / `ellipse` | optional text inside: `text, textLinks, fontFamily, fontSize, textAlign, verticalAlign, fontWeight, fontStyle, textColor` |
| `text` | `text, textLinks, fontFamily, fontSize, textAlign, fontWeight, fontStyle, textDecoration` |
| `arrow` / `line` | `points` (relative to x,y), `startArrowhead` / `endArrowhead` (`none arrow triangle dot bar`), `lineType` (`straight curved elbow`), `startBinding` / `endBinding` `{elementId}` |
| `draw` | freehand: `points` + `pressures` |
| `frame` | `name` (shown as a titled box; elements inside are assigned on load) |

Fonts: `Excalifont` (hand-written), `Nunito` (body), `Lilita One` (display titles), `Cascadia Code` (code),
`Comic Shanns`. Full TypeScript definition: `sketchboard/src/types.ts`.

**Links** (`link` on an element, or `textLinks` ranges inside text):
- `https://…` — web link
- `sketchboard:page/<pageId>` — another page of this drawing
- `sketchboard:el/<pageId>/<elementId>` — an element of this drawing
- `sketchboard:p/<drawingId>[/<pageId>[/<elementId>]]` — **another drawing**. Drawing ids are per sketchboard
  instance, so pass them in as a script argument; they can't be checked offline.

Followed with a click in view mode (Alt+R) or Ctrl+click while editing; Alt+← goes back.

**What the app fixes up on load** (so you don't have to):
- Arrows bound to shapes (`startBinding`/`endBinding`) are re-snapped to the shapes' outlines
  (`refreshBindings`). Aim them centre to centre.
- Text is re-measured: standalone `text` gets its real width/height; a shape whose text doesn't fit grows
  taller (`refit`). Your size estimates only need to be close.
- Elements inside a `frame` are assigned to it.

---

## 4. `lib.cjs` — element builders

Mirrors the app's defaults. A seeded RNG makes ids and seeds deterministic, so **the same script always
writes a byte-identical file** — you can diff regenerations.

Key builders: `text(x, y, str, o)` (no wrapping — use `\n`), `rect / ellipse(x, y, w, h | "auto", o)`
(`h: "auto"` sizes to the wrapped text), `note` (borderless wrapping paragraph), `sticky`, `connect(a, b, o)`
(bound arrow; `bend` curves it, `elbow` routes orthogonally), `frame`, `group`, `scribble` + `wavePts`
(a hand-drawn underline), colour constants `C` and fonts `FONT`.

````js
// Element builders that mirror sketchboard's own defaults.
let rng = 20251103;
const rand = () => (rng = (rng * 1103515245 + 12345) % 2147483648) / 2147483648;
let n = 0;
const id = () => `at${(++n).toString(36)}${Math.floor(rand() * 1e8).toString(36)}`;
const seed = () => Math.floor(rand() * 2 ** 31);

const C = {
  ink: "#1e1e1e", gray: "#868e96", dim: "#495057",
  blue: "#1971c2", green: "#2f9e44", red: "#e03131", orange: "#f08c00", violet: "#6741d9", teal: "#0c8599", grape: "#9c36b5", yellow: "#f59f00",
  bBlue: "#a5d8ff", bGreen: "#b2f2bb", bRed: "#ffc9c9", bYellow: "#ffec99", bViolet: "#d0bfff", bCyan: "#99e9f2", bGrape: "#eebefa", bOrange: "#ffd8a8", bGray: "#e9ecef",
  lBlue: "#e7f5ff", lGreen: "#ebfbee", lRed: "#fff5f5", lYellow: "#fff9db", lViolet: "#f3f0ff", lOrange: "#fff4e6", lGray: "#f8f9fa",
};
const FONT = { hand: "Excalifont", body: "Nunito", display: "Lilita One", code: "Cascadia Code", comic: "Comic Shanns" };
const CHAR = { Excalifont: 0.56, Nunito: 0.5, "Lilita One": 0.47, "Cascadia Code": 0.6, "Comic Shanns": 0.6 };

function base(type, x, y, width, height, extra = {}) {
  return {
    id: id(), type, x, y, width, height, angle: 0,
    strokeColor: C.ink, backgroundColor: "transparent", fillStyle: "solid", strokeWidth: 2, strokeStyle: "solid",
    roughness: 1, roundness: true, opacity: 100, seed: seed(), groupId: null, ...extra,
  };
}

/** Approximate line count when `text` wraps at `width` (the app re-measures on open). */
function wrapLines(text, width, size, font) {
  const cw = (CHAR[font] ?? 0.55) * size;
  let lines = 0;
  for (const para of text.split("\n")) {
    let cur = 0;
    lines++;
    for (const w of para.split(" ")) {
      const ww = (w.length + 1) * cw;
      if (cur + ww > width && cur > 0) {
        lines++;
        cur = ww;
      } else cur += ww;
    }
  }
  return lines;
}
const textWidth = (text, size, font) => Math.max(...text.split("\n").map((l) => l.length)) * (CHAR[font] ?? 0.55) * size;

function linksFor(text, links = []) {
  return links.map(([sub, url]) => {
    const start = text.indexOf(sub);
    if (start < 0) throw new Error(`link text not found: ${sub}`);
    return { start, end: start + sub.length, url };
  });
}

const textProps = (o) => ({
  fontFamily: o.font ?? FONT.body,
  fontSize: o.size ?? 20,
  textAlign: o.align ?? "left",
  fontWeight: o.bold ? "bold" : "normal",
  fontStyle: o.italic ? "italic" : "normal",
  textDecoration: o.decoration ?? "none",
});

/** Standalone text (no wrapping — use \n). */
function text(x, y, str, o = {}) {
  const size = o.size ?? 20;
  const font = o.font ?? FONT.body;
  const w = textWidth(str, size, font);
  const h = str.split("\n").length * size * 1.25;
  const ax = o.align === "center" ? x - w / 2 : o.align === "right" ? x - w : x;
  return base("text", ax, y, w, h, {
    strokeColor: o.color ?? C.ink, strokeWidth: 1, roughness: 0, roundness: false,
    text: str, textLinks: linksFor(str, o.links), ...textProps({ ...o, font, size }),
    angle: o.angle ?? 0, opacity: o.opacity ?? 100, link: o.link ?? null, locked: o.locked,
  });
}

/** Shape with text inside (rectangle / diamond / ellipse). */
function shape(type, x, y, w, h, o = {}) {
  const font = o.font ?? FONT.hand;
  const size = o.size ?? 20;
  let height = h;
  if (o.text && h === "auto") {
    const inner = (type === "rectangle" ? w : w * 0.7) - 20;
    height = wrapLines(o.text, inner, size, font) * size * 1.25 + (o.pad ?? 20) * 2;
  }
  const el = base(type, x, y, w, height, {
    strokeColor: o.stroke ?? C.ink, backgroundColor: o.bg ?? "transparent", fillStyle: o.fill ?? "solid",
    strokeWidth: o.sw ?? 2, strokeStyle: o.dash ?? "solid", roughness: o.rough ?? 1, roundness: o.round ?? true,
    opacity: o.opacity ?? 100, angle: o.angle ?? 0, link: o.link ?? null, locked: o.locked,
  });
  if (o.text !== undefined) {
    Object.assign(el, textProps({ ...o, font, size, align: o.align ?? "center" }), {
      text: o.text,
      textLinks: linksFor(o.text, o.links),
      verticalAlign: o.valign ?? "middle",
      // Text falls back to the stroke colour, so borderless shapes need an explicit ink.
      textColor: o.color ?? (o.stroke === "transparent" ? C.ink : undefined),
    });
  }
  return el;
}
const rect = (x, y, w, h, o) => shape("rectangle", x, y, w, h, o);
const ellipse = (x, y, w, h, o) => shape("ellipse", x, y, w, h, o);

/** A borderless wrapping paragraph. */
function note(x, y, w, str, o = {}) {
  return rect(x, y, w, "auto", {
    stroke: "transparent", bg: o.bg ?? "transparent", rough: 0, sw: 1, round: o.round ?? true,
    font: o.font ?? FONT.body, size: o.size ?? 20, align: o.align ?? "left", valign: "top", pad: o.pad ?? 10,
    color: o.color ?? C.ink, ...o, text: str,
  });
}

/** Sticky note — same defaults as the sticky tool. */
function sticky(x, y, w, str, o = {}) {
  return rect(x, y, w, o.h ?? "auto", {
    bg: o.bg ?? C.bYellow, stroke: C.ink, sw: 1, rough: 0, round: true,
    font: o.font ?? FONT.hand, size: o.size ?? 20, align: "left", valign: "top", pad: 14, ...o, text: str,
  });
}

const center = (e) => ({ x: e.x + e.width / 2, y: e.y + e.height / 2 });

function linear(type, worldPts, o = {}) {
  const minX = Math.min(...worldPts.map((p) => p.x));
  const minY = Math.min(...worldPts.map((p) => p.y));
  const maxX = Math.max(...worldPts.map((p) => p.x));
  const maxY = Math.max(...worldPts.map((p) => p.y));
  return base(type, minX, minY, Math.max(1, maxX - minX), Math.max(1, maxY - minY), {
    strokeColor: o.stroke ?? C.ink, strokeWidth: o.sw ?? 2, strokeStyle: o.dash ?? "solid", roughness: o.rough ?? 1,
    roundness: false, opacity: o.opacity ?? 100,
    points: worldPts.map((p) => [p.x - minX, p.y - minY]),
    lineType: o.lineType ?? (worldPts.length > 2 ? "curved" : "straight"),
    startArrowhead: o.start ?? "none", endArrowhead: o.end ?? (type === "arrow" ? "arrow" : "none"),
    startBinding: o.from ? { elementId: o.from.id } : null, endBinding: o.to ? { elementId: o.to.id } : null,
    link: o.link ?? null, locked: o.locked,
  });
}

/** Arrow bound between two shapes; `bend` curves it sideways, `elbow` routes orthogonally. */
function connect(a, b, o = {}) {
  const p = center(a);
  const q = center(b);
  const pts = [p];
  if (o.bend) {
    const len = Math.hypot(q.x - p.x, q.y - p.y) || 1;
    pts.push({ x: (p.x + q.x) / 2 - ((q.y - p.y) / len) * o.bend, y: (p.y + q.y) / 2 + ((q.x - p.x) / len) * o.bend });
  }
  pts.push(q);
  return linear("arrow", pts, { ...o, from: a, to: b, lineType: o.elbow ? "elbow" : o.bend ? "curved" : "straight" });
}

/** Freehand stroke through `pts`. */
function scribble(pts, o = {}) {
  const dense = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const steps = Math.max(2, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8));
    for (let s = 0; s < steps; s++) {
      const t = s / steps;
      dense.push({ x: a.x + (b.x - a.x) * t + (rand() - 0.5) * 1.2, y: a.y + (b.y - a.y) * t + (rand() - 0.5) * 1.2 });
    }
  }
  dense.push(pts[pts.length - 1]);
  const el = linear("line", dense, { stroke: o.stroke ?? C.red, sw: o.sw ?? 3, rough: 0, opacity: o.opacity });
  el.type = "draw";
  for (const k of ["lineType", "startArrowhead", "endArrowhead", "startBinding", "endBinding"]) delete el[k];
  el.pressures = dense.map((_, i) => 0.35 + 0.25 * Math.sin((i / dense.length) * Math.PI));
  return el;
}
const wavePts = (x, y, w, amp = 4) => {
  const out = [];
  for (let i = 0; i <= w; i += 14) out.push({ x: x + i, y: y + Math.sin(i / 22) * amp });
  return out;
};

const frame = (x, y, w, h, name) => base("frame", x, y, w, h, { strokeColor: C.ink, roughness: 0, strokeWidth: 1, name });

function group(els) {
  const g = id();
  for (const e of els) e.groupId = g;
  return els;
}

module.exports = { C, FONT, base, text, rect, ellipse, note, sticky, connect, scribble, wavePts, frame, group, center, textWidth, wrapLines, id };
````

---

## 5. `kit.cjs` — the diagram kit

Built on `lib.cjs`. What each helper is for:

| helper | use |
| --- | --- |
| `K` | colour roles: `driver` violet, `data` teal, `rollout` blue, `reward` orange, `replay` grape, `trainer` green, `sync` red, `gray` — each `{s: stroke, b: bold fill, l: light fill}` |
| `box(x, y, w, h, text, role, o)` | a hand-drawn node for flowcharts |
| `card(x, y, w, text, role, o)` | an auto-height note card (first line = title) |
| `code(x, y, w, text, o)` | monospace block |
| `h2`, `small`, `label` | section heading, italic caption, small label |
| `arrow(a, b, role, o)` | bound arrow in a role colour |
| `poly(points, o)` / `harrow(x1, x2, y, o)` | free polyline or arrow (axes, sequence messages); `o.type: "arrow"`, `o.end: "triangle"` |
| `table(x, y, cols, rows, o)` → `{els, h}` | grid; `cols: [{w, code?}]`, `rows[0]` is the header, `o.cellBg(ri, ci)` colours cells, `o.firstCol` tints column 0 |
| `plot(x, y, w, h, {x0,x1,y0,y1}, [{f, stroke, dash}], o)` | line chart: samples `f` 160 times; `o.title, xlabel, ylabel, guides: [{x|y, label}]` |
| `bars(x, y, w, h, vmin, vmax, [{v, top, label, color}], o)` | bar chart (negative values go down) |
| `pagesKit(prefix, names, accent)` → `{pageId, LINK, header, write}` | page ids `<prefix>-<i>`; `LINK.page(i)`, `LINK.el(i, id)`; `header()` = ⌂ / ← / → nav buttons + title + underline + subtitle; `write(builders, out)` builds pages, checks ids are unique and every internal link lands, writes the file |
| `files(x, y, w, text)` | a "Code: …" provenance line |

````js
// Shared drawing kit for the BluTrain showcases (gen-blutrain.cjs, gen-tq.cjs).
// Builds on ../atlas-src/lib.cjs: component palette, boxes and cards, tables, plots, bar charts,
// page headers with navigation, and a writer that checks every internal link.
const fs = require("fs");
const L = require("../atlas-src/lib.cjs");
const { C, FONT, text, rect, note, connect } = L;

// ---------- palette: one colour per component ----------
const K = {
  driver: { s: C.violet, b: C.bViolet, l: C.lViolet },
  data: { s: C.teal, b: C.bCyan, l: "#e3fafc" },
  rollout: { s: C.blue, b: C.bBlue, l: C.lBlue },
  reward: { s: C.orange, b: C.bOrange, l: C.lOrange },
  replay: { s: C.grape, b: C.bGrape, l: "#f8f0fc" },
  trainer: { s: C.green, b: C.bGreen, l: C.lGreen },
  sync: { s: C.red, b: C.bRed, l: C.lRed },
  gray: { s: C.dim, b: C.bGray, l: C.lGray },
};

// ---------- small builders ----------
const box = (x, y, w, h, str, k = "gray", o = {}) =>
  rect(x, y, w, h, { text: str, font: FONT.hand, size: 18, bg: K[k].b, stroke: K[k].s, sw: 2, color: C.ink, ...o });
const card = (x, y, w, str, k = "gray", o = {}) =>
  rect(x, y, w, "auto", { text: str, font: FONT.body, size: 16, align: "left", valign: "top", pad: 14, bg: K[k].l, stroke: K[k].s, sw: 1.5, rough: 0.6, color: C.ink, ...o });
const code = (x, y, w, str, o = {}) =>
  rect(x, y, w, "auto", { text: str, font: FONT.code, size: 15, align: "left", valign: "top", pad: 16, bg: C.lGray, stroke: C.gray, sw: 1, rough: 0, color: C.ink, ...o });
const h2 = (x, y, str, o = {}) => text(x, y, str, { font: FONT.hand, size: 34, ...o });
const small = (x, y, str, o = {}) => text(x, y, str, { size: 15, color: C.gray, italic: true, ...o });
const label = (x, y, str, o = {}) => text(x, y, str, { size: 14, color: C.dim, ...o });
const arrow = (a, b, k = "gray", o = {}) => connect(a, b, { stroke: K[k].s, sw: 2, rough: 0.6, end: "triangle", ...o });

/** Free polyline / arrow through world points (axes, plots, sequence messages). */
function poly(pts, o = {}) {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  return L.base(o.type ?? "line", minX, minY, Math.max(1, Math.max(...xs) - minX), Math.max(1, Math.max(...ys) - minY), {
    strokeColor: o.stroke ?? C.ink, strokeWidth: o.sw ?? 2, strokeStyle: o.dash ?? "solid", roughness: o.rough ?? 0,
    roundness: false, opacity: o.opacity ?? 100, points: pts.map((p) => [p.x - minX, p.y - minY]),
    lineType: "straight", startArrowhead: o.start ?? "none", endArrowhead: o.end ?? "none",
    startBinding: null, endBinding: null, link: null,
  });
}
const harrow = (x1, x2, y, o = {}) => poly([{ x: x1, y }, { x: x2, y }], { type: "arrow", end: "triangle", ...o });

/** Grid table. cols: [{w, code?}], rows[0] is the header. */
function table(x, y, cols, rows, o = {}) {
  const els = [];
  const size = o.size ?? 15;
  let cy = y;
  rows.forEach((row, ri) => {
    const head = ri === 0;
    const h = Math.max(
      ...row.map((cell, ci) => {
        const font = cols[ci].code && !head ? FONT.code : FONT.body;
        return L.wrapLines(String(cell), cols[ci].w - 24, size, font) * size * 1.25 + 22;
      }),
    );
    let cx = x;
    row.forEach((cell, ci) => {
      els.push(
        rect(cx, cy, cols[ci].w, h, {
          text: String(cell), font: cols[ci].code && !head ? FONT.code : FONT.body, size, bold: head, align: "left", valign: "middle", pad: 11,
          bg: head ? (o.head ?? C.bGray) : ci === 0 && o.firstCol ? o.firstCol : (o.cellBg?.(ri, ci) ?? "#ffffff"),
          stroke: C.gray, sw: 1, rough: 0, round: false, color: C.ink,
        }),
      );
      cx += cols[ci].w;
    });
    cy += h;
  });
  return { els, h: cy - y };
}

/** A small line chart. fns: [{f, stroke, label}] evaluated on [x0,x1]. */
function plot(x, y, w, h, r, fns, o = {}) {
  const els = [];
  const X = (v) => x + ((v - r.x0) / (r.x1 - r.x0)) * w;
  const Y = (v) => y + h - ((v - r.y0) / (r.y1 - r.y0)) * h;
  els.push(rect(x, y, w, h, { bg: "#ffffff", stroke: C.bGray, sw: 1, rough: 0, round: false }));
  // axes through zero when it is in range
  const ax = r.y0 <= 0 && r.y1 >= 0 ? Y(0) : y + h;
  els.push(poly([{ x, y: ax }, { x: x + w + 14, y: ax }], { type: "arrow", end: "triangle", stroke: C.dim, sw: 1.5 }));
  const ay = r.x0 <= 0 && r.x1 >= 0 ? X(0) : x;
  els.push(poly([{ x: ay, y: y + h }, { x: ay, y: y - 14 }], { type: "arrow", end: "triangle", stroke: C.dim, sw: 1.5 }));
  for (const g of o.guides ?? []) {
    if (g.x !== undefined) els.push(poly([{ x: X(g.x), y }, { x: X(g.x), y: y + h }], { stroke: C.gray, sw: 1, dash: "dashed" }), label(X(g.x) - 20, y + h + 6, g.label ?? String(g.x), { size: 13 }));
    if (g.y !== undefined) els.push(poly([{ x, y: Y(g.y) }, { x: x + w, y: Y(g.y) }], { stroke: C.gray, sw: 1, dash: "dashed" }), label(x - 8, Y(g.y) - 9, g.label ?? String(g.y), { size: 13, align: "right" }));
  }
  for (const s of fns) {
    const pts = [];
    const steps = 160;
    for (let i = 0; i <= steps; i++) {
      const v = r.x0 + ((r.x1 - r.x0) * i) / steps;
      const fv = s.f(v);
      if (fv === null) continue;
      pts.push({ x: X(v), y: Y(Math.max(r.y0, Math.min(r.y1, fv))) });
    }
    els.push(poly(pts, { stroke: s.stroke, sw: s.sw ?? 3, dash: s.dash }));
  }
  if (o.xlabel) els.push(label(x + w - 4, (r.y0 <= 0 && r.y1 >= 0 ? Y(0) : y + h) + 8, o.xlabel, { align: "right", size: 14 }));
  if (o.ylabel) els.push(label(ay + 8, y - 16, o.ylabel, { size: 14 }));
  if (o.title) els.push(text(x, y - 46, o.title, { size: 18, bold: true }));
  return els;
}

/** Vertical bar chart. bars: [{v, label, color}] */
function bars(x, y, w, h, vmin, vmax, list, o = {}) {
  const els = [];
  const bw = w / list.length;
  const Y = (v) => y + h - ((v - vmin) / (vmax - vmin)) * h;
  const zero = Y(Math.max(vmin, 0));
  els.push(poly([{ x: x - 10, y: zero }, { x: x + w + 10, y: zero }], { stroke: C.dim, sw: 1.5 }));
  list.forEach((b, i) => {
    const top = Math.min(zero, Y(b.v));
    const bh = Math.max(2, Math.abs(Y(b.v) - zero));
    els.push(rect(x + i * bw + bw * 0.18, top, bw * 0.64, bh, { bg: b.color, stroke: b.stroke ?? C.dim, sw: 1, rough: 0.4, round: false }));
    els.push(text(x + i * bw + bw / 2, b.v >= 0 ? top - 26 : top + bh + 6, b.top ?? String(b.v), { size: 15, align: "center", bold: true, font: FONT.code }));
    if (b.label) els.push(text(x + i * bw + bw / 2, (o.labelY ?? y + h) + 10, b.label, { size: 14, align: "center", color: C.dim }));
  });
  return els;
}


/**
 * Page plumbing for one drawing: ids `<prefix>-<i>`, links, and the header every page starts with
 * (⌂ Overview · ← previous · next → buttons, title, scribble underline, subtitle).
 */
function pagesKit(prefix, names, accent) {
  const pageId = (i) => `${prefix}-${i}`;
  const LINK = { page: (i) => `sketchboard:page/${pageId(i)}`, el: (i, id) => `sketchboard:el/${pageId(i)}/${id}` };
  function header(pi, title, sub) {
    const els = [];
    const items = [];
    if (pi > 0) items.push({ label: `⌂ ${names[0].replace(/^\d+ · /, "")}`, link: LINK.page(0) });
    if (pi > 1) items.push({ label: `← ${names[pi - 1]}`, link: LINK.page(pi - 1) });
    if (pi < names.length - 1) items.push({ label: `${names[pi + 1]} →`, link: LINK.page(pi + 1) });
    let x = 0;
    for (const it of items) {
      const w = Math.round(L.textWidth(it.label, 15, FONT.body) + 40);
      els.push(rect(x, -72, w, 40, { text: it.label, link: it.link, font: FONT.body, size: 15, bg: C.lGray, stroke: C.gray, sw: 1, rough: 0, color: C.dim, locked: true }));
      x += w + 12;
    }
    els.push(text(0, 0, title, { font: FONT.display, size: pi === 0 ? 72 : 60, locked: true }));
    els.push(Object.assign(L.scribble(L.wavePts(2, pi === 0 ? 96 : 84, Math.min(1300, L.textWidth(title, pi === 0 ? 72 : 60, FONT.display) + 40), 3), { stroke: accent[pi], sw: 4 }), { locked: true }));
    els.push(text(0, pi === 0 ? 118 : 104, sub, { size: 22, color: C.dim, locked: true }));
    return els;
  }
  /** Build every page, check ids and internal links, write the drawing to `out`. */
  function write(builders, out) {
    const pages = builders.map((b, i) => ({ id: pageId(i), name: names[i], elements: b() }));
    const doc = { type: "sketchboard", version: 2, pages, activePageId: pages[0].id, canvasBg: "#fbfcfd" };
    const ids = new Set();
    let internal = 0;
    for (const p of pages)
      for (const e of p.elements) {
        if (ids.has(e.id)) throw new Error("duplicate id");
        ids.add(e.id);
      }
    for (const p of pages)
      for (const e of p.elements)
        for (const url of [e.link, ...(e.textLinks ?? []).map((l) => l.url)]) {
          if (!url?.startsWith("sketchboard:")) continue;
          if (url.startsWith("sketchboard:p/")) continue; // into another drawing: ids are per instance, not checkable here
          internal++;
          const m = /^sketchboard:(?:page\/([\w-]+)|el\/([\w-]+)\/([\w-]+))$/.exec(url);
          const pg = m && pages.find((q) => q.id === (m[1] ?? m[2]));
          if (!pg || (m[3] && !pg.elements.some((x) => x.id === m[3]))) throw new Error(`broken link ${url} on ${p.name}`);
        }
    console.log(pages.map((p) => `${p.name}: ${p.elements.length} elements`).join("\n"));
    console.log("links within the drawing:", internal);
    fs.writeFileSync(out, JSON.stringify(doc));
    console.log("bytes", fs.statSync(out).size);
  }
  return { pageId, LINK, header, write };
}

/** "Code:" chip listing the main source files. */
const files = (x, y, w, str) => note(x, y, w, `Code: ${str}`, { size: 14, color: C.gray, font: FONT.code, pad: 6 });

module.exports = { K, box, card, code, h2, small, label, arrow, poly, harrow, table, plot, bars, pagesKit, files };
````

---

## 6. A minimal example

````js
// A minimal sketchboard drawing built from code: a 4-step flowchart with a decision.
// The showcase generators (gen-*.cjs) are this, scaled up.
//
//   node hello-flow.cjs hello.sketchboard.json      # write the drawing
//   then Home → Open file… in sketchboard, or POST it to /api/import (see import.cjs)
const fs = require("fs");
const { C, FONT, text, rect, connect } = require("../atlas-src/lib.cjs");
const { box, card, arrow, h2 } = require("../blutrain-src/kit.cjs");

const els = [];
els.push(text(0, 0, "Hello, flowchart", { font: FONT.display, size: 60 }));
els.push(h2(0, 100, "From a prompt to a reward"));

// box(x, y, width, height, label, colour role) — coordinates are canvas pixels
const prompt = box(0, 180, 260, 90, "prompt\nfrom the dataset", "data");
const model = box(340, 180, 260, 90, "model generates\nan answer", "rollout");
const check = rect(680, 160, 280, 130, { text: "answer\ncorrect?", font: FONT.hand, size: 18, bg: C.bYellow, stroke: C.orange });
check.type = "diamond"; // any shape builder can become a diamond or ellipse
const good = box(1040, 120, 220, 80, "reward 1", "trainer");
const bad = box(1040, 260, 220, 80, "reward 0", "sync");
els.push(prompt, model, check, good, bad);

// connect() binds an arrow to both shapes; the app snaps its ends to their outlines on load
els.push(arrow(prompt, model, "rollout"), arrow(model, check), arrow(check, good, "trainer"), arrow(check, bad, "sync"));
els.push(text(985, 150, "yes", { size: 14 }), text(985, 300, "no", { size: 14 }));

// TODO(human): add a fifth step after "reward 1"

els.push(card(0, 420, 960, "card(x, y, width, text, role) grows its height to fit the text — use it for notes.", "gray"));

const doc = { type: "sketchboard", version: 2, pages: [{ id: "hello-0", name: "Hello", elements: els }], activePageId: "hello-0", canvasBg: "#fbfcfd" };
fs.writeFileSync(process.argv[2] || "hello.sketchboard.json", JSON.stringify(doc));
console.log(`${els.length} elements →`, process.argv[2] || "hello.sketchboard.json");
````

```bash
node hello-flow.cjs hello.sketchboard.json
node import.cjs hello.sketchboard.json "Hello"     # prints http://localhost:5184/#/p/<id>
```

`import.cjs`:

````js
// Send a drawing file to a running sketchboard, the same way the app's "Open file…" does.
//   node import.cjs hello.sketchboard.json "My drawing" [http://localhost:5184]
// Prints the new drawing's id; open it at <base>/#/p/<id>.
const doc = require(require("path").resolve(process.argv[2]));
const name = process.argv[3] || "Imported drawing";
const base = process.argv[4] || "http://localhost:5184";

fetch(`${base}/api/import`, {
  method: "POST",
  // The server refuses API calls without this header (a guard against cross-site requests).
  headers: { "content-type": "application/json", "X-Sketchboard": "1" },
  body: JSON.stringify({ name, doc }),
})
  .then((r) => r.json())
  .then((j) => console.log(j.id ? `${base}/#/p/${j.id}` : j));
````

`update.cjs` (replace a drawing in place — **close it in the browser first**, an open editor autosaves its
own copy over yours):

````js
// Replace the contents of an existing drawing (keeps its id, so links into it keep working).
//   node update.cjs hello.sketchboard.json <drawingId> [http://localhost:5184]
// Close the drawing in the browser first (go to Home): an open editor autosaves its own copy and
// can overwrite this update.
const doc = require(require("path").resolve(process.argv[2]));
const id = process.argv[3];
const base = process.argv[4] || "http://localhost:5184";
if (!id) throw new Error("usage: node update.cjs <file.json> <drawingId> [baseUrl]");

fetch(`${base}/api/projects/${id}`, {
  method: "PUT",
  headers: { "content-type": "application/json", "X-Sketchboard": "1" },
  body: JSON.stringify({ doc, force: true }), // force: replace even if the server copy is newer
})
  .then((r) => r.text())
  .then((t) => console.log(t.slice(0, 200)));
````

---

## 7. Recipes

All snippets assume `const els = []` and the kit/lib imports above.

**Flowchart with a decision**
```js
const a = box(0, 0, 260, 90, "step one", "data");
const q = rect(340, -20, 280, 130, { text: "condition?", font: FONT.hand, size: 18, bg: C.bYellow, stroke: C.orange });
q.type = "diamond";
const yes = box(700, -60, 240, 80, "then", "trainer");
const no = box(700, 80, 240, 80, "else", "sync");
els.push(a, q, yes, no, arrow(a, q), arrow(q, yes, "trainer"), arrow(q, no, "sync"));
els.push(label(640, -40, "yes"), label(640, 120, "no"));
```

**A row of steps** (and a vertical "ladder" of cards whose heights you don't know in advance)
```js
const steps = ["read", "parse", "compare"].map((t, i) => box(i * 320, 0, 280, 90, t, "rollout"));
els.push(...steps);
for (let i = 0; i < steps.length - 1; i++) els.push(arrow(steps[i], steps[i + 1], "rollout"));

let y = 200; const cards = [];
for (const t of ["first check", "second check", "fallback"]) { const c = card(0, y, 700, t, "gray"); cards.push(c); y += c.height + 20; }
els.push(...cards); for (let i = 0; i < cards.length - 1; i++) els.push(arrow(cards[i], cards[i + 1]));
```
`card(..., "auto")` already knows its height (`c.height`), so stack by accumulating it.

**Architecture diagram**: a `frame(x, y, w, h, "title")` around it, dashed tinted `rect`s as zones
(`{bg: K.trainer.l, stroke: K.trainer.s, dash: "dashed", opacity: 70}`) with a bold `text` caption, `box`es
inside, and three arrow styles for three kinds of traffic (solid / dashed / thick) plus a legend made of
`poly` arrows and `label`s.

**Sequence diagram** (lanes + horizontal messages)
```js
function sequence(els, lanes, top, bottom, msgs, y0, gap) {   // lanes [{name, k, x}], msgs [{a, b, t, d?, bold?}]
  for (const l of lanes) {
    els.push(box(l.x - 150, top, 300, 80, l.name, l.k));
    els.push(poly([{ x: l.x, y: top + 80 }, { x: l.x, y: bottom }], { stroke: K[l.k].s, sw: 1.5, dash: "dashed" }));
  }
  msgs.forEach((m, i) => {
    if (m.a === m.b) return;                                   // spacer row
    const y = y0 + i * gap, xa = lanes[m.a].x, xb = lanes[m.b].x, right = xb > xa;
    els.push(harrow(xa + (right ? 4 : -4), xb + (right ? -6 : 6), y, { stroke: K[lanes[m.a].k].s, sw: m.bold ? 4 : 2 }));
    els.push(text(Math.min(xa, xb) + 16, y - 28, m.t, { size: 15, font: FONT.code, bold: m.bold }));
    if (m.d) els.push(text(Math.min(xa, xb) + 16, y + 8, m.d, { size: 13, color: C.gray, italic: true }));
  });
}
```

**Swimlane timeline**: one label box + one long tinted `rect` per lane (`y = top + lane * laneHeight`), event
boxes placed by an x offset inside the lane, `arrow`s between events (they may cross lanes).

**Table with coloured result column**
```js
const T = table(0, 0, [{ w: 400, code: true }, { w: 120 }, { w: 100 }], [
  ["input", "why", "score"], ["\\boxed{72}", "match", "1"], ["72.", "period kept", "0"],
], { size: 14, cellBg: (ri, ci) => (ci === 2 && ri > 0 ? (ri === 1 ? C.bGreen : C.bRed) : "#ffffff") });
els.push(...T.els);   // T.h = total height, for placing what comes next
```

**Line chart**
```js
els.push(...plot(0, 0, 500, 300, { x0: 0, x1: 2, y0: 0, y1: 2 }, [
  { f: (r) => r, stroke: C.gray, sw: 2, dash: "dashed" },
  { f: (r) => Math.min(r, Math.min(Math.max(r, 0.8), 1.2)), stroke: C.green },
], { title: "clipped objective vs ratio", xlabel: "r", guides: [{ x: 0.8, label: "1−ε" }, { x: 1.2, label: "1+ε" }] }));
```

**Bar chart**: `els.push(...bars(0, 0, 400, 220, 0, 12, [{ v: 6.29, top: "6.29%", label: "base", color: C.bGray }, { v: 9.86, top: "9.86%", label: "after", color: C.bGreen }]))`.

**Number line / ranges**: a `poly` arrow as the axis, tick `poly`s + `label`s, then per row small `ellipse`
dots for discrete values or a thin `rect` for a range.

**Grids that teach** (token rows, byte layouts, a reward placed on the last token, a free list): rows of small
`rect`s with `round: false, rough: 0`, coloured by meaning, with a `poly` bracket underneath
(`[{x1,y},{x1,y+10},{x2,y+10},{x2,y}]`) and a label naming the span.

**Multi-page drawing with navigation**
```js
const { LINK, header, write } = pagesKit("ex", ["0 · Overview", "1 · Details"], [C.violet, C.blue]);
function overview() { const els = header(0, "Title", "subtitle"); els.push(box(0, 200, 300, 90, "details →", "data", { link: LINK.page(1) })); return els; }
function details() { const els = header(1, "Details", "…"); return els; }
write([overview, details], process.argv[2]);
```

**Beginner pages**: open each page with `sticky(0, 200, 900, "In plain words\n…", {font: FONT.body, bg: C.bYellow})`.

---

## 8. Layout rules that keep pages readable

- Content width about **2000 px** per page (x from 0 to ~1960); the header takes y −72 … ~140; content starts
  around y 200 (y 420 below an "In plain words" note).
- Sizes: page title 60 (overview 72), `h2` 34, body 15–18, labels 13–14, code 14–15.
- Two-column pages: left column x 0 … ~960, right x ~1000 … 1960. Keep tables inside their column — sum the
  `cols` widths.
- Text width is estimated as `chars × factor × size` (factors in `lib.cjs`: Nunito 0.5, Excalifont 0.56,
  Cascadia 0.6). Headings longer than their column collide with the next column: shorten them.
- Leave ~60 px between a heading and what follows, ~20 px between stacked cards.
- Put every arrow label next to its arrow, not on it; offset `label`s from lines by 8–10 px.
- Use colour by **role**, consistently across all pages (same colour = same kind of component).
- Diamonds need ~40% more height than their text suggests.
- Use `locked: true` on titles and headers so readers don't drag them by accident.

---

## 9. The workflow, step by step

1. **Research the subject** (read the code or source). For a large codebase, have a helper agent write a
   report with file paths, function names, constants and examples, then **verify the important claims
   yourself** — read the cited lines, and where possible build and run the code to produce real examples.
   Label examples by provenance: ran / asserted in a test / read from code. Never draw something you haven't
   checked; correct the report where the code disagrees.
2. **Plan pages**: an overview (architecture diagram + page index with links), then one page per component,
   then an end-to-end flow page, then config / dependencies / caveats. Decide colour roles once.
3. **Write the generator**: one function per page returning `els`, all using `header(i, …)`. Lay out top to
   bottom with explicit y values; reuse returned heights (`T.h`, `card.height`) to place what follows.
4. **Generate**: `node gen-x.cjs out.json` — `write()` fails loudly on duplicate ids or broken internal links.
5. **Import** with `import.cjs` (new) or `update.cjs` (same id; close the drawing in the browser first).
6. **Check the layout in the browser**: open `#/p/<id>`, run `check-layout.js`, screenshot each page at a
   readable zoom. Look for collisions, arrows crossing boxes, text overflowing, plots with axes in odd places.
7. **Fix and regenerate**; repeat 4–6 until the overlap check is empty and screenshots look right.
8. **Confirm reproducibility**: generate twice and `cmp` the files.

`check-layout.js`:

````js
// Paste into the browser console (or a page-evaluation tool) on a sketchboard dev server with a
// drawing open at #/p/<id>. Reports text-bearing elements whose boxes overlap, per page, using the
// sizes the app computed after re-measuring text — so it catches labels the generator's width
// estimate got wrong. Needs the Vite dev server (it imports the app's own store module).
(async () => {
  const S = (await import("/src/store.ts")).useStore;
  const out = {};
  for (const p of S.getState().pages) {
    S.getState().switchPage(p.id);
    await new Promise((r) => setTimeout(r, 200));
    const els = S.getState().elements.filter((e) => ["text", "rectangle", "ellipse", "diamond"].includes(e.type) && (e.type === "text" || e.text));
    const hits = [];
    for (let i = 0; i < els.length; i++)
      for (let j = i + 1; j < els.length; j++) {
        const a = els[i];
        const b = els[j];
        const w = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
        const h = Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y);
        if (w > 3 && h > 3 && !(a.groupId && a.groupId === b.groupId)) {
          const d = (e) => `${(e.text || "").slice(0, 28).replace(/\n/g, " ")} [${Math.round(e.x)},${Math.round(e.y)} ${Math.round(e.width)}×${Math.round(e.height)}]`;
          hits.push(`${d(a)}  X  ${d(b)}`);
        }
      }
    if (hits.length) out[p.name] = hits;
  }
  console.log(Object.keys(out).length ? out : "no overlaps");
  return out;
})();

// Jump the view to a world-coordinate rectangle (useful before taking a screenshot):
//   const S = (await import("/src/store.ts")).useStore;
//   const [x0, y0, x1, y1] = [-20, 180, 1980, 1400];
//   const z = Math.min(innerWidth / (x1 - x0), (innerHeight - 60) / (y1 - y0));
//   S.getState().setViewport({ zoom: z, scrollX: -x0 + (innerWidth / z - (x1 - x0)) / 2, scrollY: -y0 + 30 / z });
// screen = (world + scroll) × zoom. Right after switchPage/opening, the app restores its own saved
// view — wait ~1 s before calling setViewport, or it gets overwritten.
````

If you can't drive a browser, import the file and ask a human to look; the overlap check is the part most
worth automating.

---

## 10. Gotchas (all hit in practice)

- Missing `X-Sketchboard: 1` header → every API call is refused.
- An open editor tab autosaves its in-memory copy: navigate it to Home before `update.cjs`, and after a
  hash-only navigation the tab may still show the old copy — do a full reload before checking.
- After opening a drawing or switching pages, the app restores its saved viewport about a second later;
  wait before calling `setViewport`.
- Bound arrows (`connect`) need both endpoints to be elements that exist in the same page; a fake `{x, y}`
  object is not bindable — use `poly(…, {type: "arrow"})` for free arrows.
- `arrow`s whose `bend` points the wrong way cut through boxes: flip the sign or route straight.
- Characters some fonts lack (subscript `ᵢ`, `ₜ`) render as boxes in `Cascadia Code` — write `_i`.
- In JS strings, LaTeX backslashes double: `"\\boxed{72}"` renders `\boxed{72}`.
- `table` rows take the height of their tallest cell; very narrow columns make tall rows.
- Text placed under a `frame` stays inside it; a `frame` title is its `name`.
- Cross-drawing links break when the drawings are imported into a different instance (new ids): make the ids
  script arguments and regenerate.

---

## 11. Reference: a complete 14-page generator

`gen-rv.cjs` ("BluTrain reward verifiers, explained") uses every pattern above: overview with an architecture
diagram and page guide, layered architecture, a swimlane, a watchdog timeline, config tables, per-component
pages with coloured example tables, a dependency graph, cross-drawing links, and a bugs page. Other generators
in the same folder (not included here for size): `gen-blutrain.cjs` (sequence diagrams, plots, GPU topology),
`gen-tq.cjs` (`sequence()` helper, byte layouts, race timelines), `gen-mv.cjs` (parse tree, probe-point plot),
`gen-verl.cjs` (beginner pages, score number line).

````js
// Builds the "BluTrain reward verifiers, explained" sketchboard showcase: every verifier in
// /home/blubridge-029/RLVR-main/RL/BluTrain/RL (src/reward, include/reward), the async reward loop, the
// scaffolding, and each verifier's dependencies. Read 2026-11-05 (working tree as of 23:15).
// Examples: [RAN] = run against the current sources, [TEST] = asserted in a passing unit test.
//
// usage: node gen-rv.cjs <out.json> [mathDrawingId]
// The math page links into the "Math verifier, explained" drawing. Drawing ids differ per sketchboard
// instance; the default is that drawing's id in the dev instance this was built in.
const L = require("../atlas-src/lib.cjs");
const { C, FONT, text, rect, ellipse, note, sticky, connect, frame } = L;
const { K, box, card, code, h2, small, label, arrow, poly, harrow, table, bars, pagesKit, files } = require("./kit.cjs");

const MATH_DRAWING = process.argv[3] || "20d128a7-4fca-4474-98e3-441a6c9677e1";
const MATH = (page = 0) => `sketchboard:p/${MATH_DRAWING}/mv-${page}`;

const PAGE_NAMES = [
  "0 · Overview",
  "1 · Architecture",
  "2 · One rollout, end to end",
  "3 · Reward loop & registry",
  "4 · Config & wiring",
  "5 · gsm8k",
  "6 · exact_match & short_response",
  "7 · math",
  "8 · IFEval: how it scores",
  "9 · IFEval: the 54 rules",
  "10 · IFEval: NLTK, langdetect, PyStr",
  "11 · Scaffolding",
  "12 · Dependencies & build",
  "13 · Bugs & gotchas",
];
const ACCENT = [C.violet, C.violet, C.dim, C.violet, C.dim, C.blue, C.teal, C.orange, C.green, C.green, C.green, C.gray, C.dim, C.red];
const { LINK, header, write } = pagesKit("rv", PAGE_NAMES, ACCENT);
// Roles: loop/registry = violet, verifier = blue, data/config = teal, IFEval = green, math = orange,
// stubs = gray, failure = red.
const V = "src/reward/verifiers/";

const plain = (x, y, w, str, o = {}) => sticky(x, y, w, `In plain words\n${str}`, { size: 17, font: FONT.body, bg: C.bYellow, ...o });
function exTable(x, y, cols, rows, size = 14) {
  return table(x, y, cols, [rows[0], ...rows.slice(1).map((r) => r.slice(0, cols.length))], {
    size,
    cellBg: (ri, ci) => (ci === cols.length - 1 && rows[ri][cols.length] !== undefined ? (rows[ri][cols.length] ? C.bGreen : C.bRed) : "#ffffff"),
  });
}
function flow(els, x, y, w, h, gap, items) {
  const out = items.map(([t, k, o]) => box(x, y, w, h, t, k, { size: 15, ...o }));
  out.forEach((b, i) => (b.x = x + i * (w + gap)));
  els.push(...out);
  for (let i = 0; i < out.length - 1; i++) els.push(arrow(out[i], out[i + 1], items[i + 1][1]));
  return out;
}
function ladder(els, x, y, w, items, gap = 18) {
  const out = [];
  for (const [t, k, o] of items) {
    const r = card(x, y, w, t, k, { size: 15, ...o });
    out.push(r);
    y += r.height + gap;
  }
  els.push(...out);
  for (let i = 0; i < out.length - 1; i++) els.push(arrow(out[i], out[i + 1], "gray", { sw: 1.5 }));
  return out;
}

// ======================================================================
// 0 · Overview
// ======================================================================
function overview() {
  const els = header(0, "BluTrain reward verifiers — the complete picture", "Every verifier in BluTrain/RL, the async loop that runs them, the scaffolding around them, and what each one depends on");
  els.push(small(0, 156, "Read from RL/src/reward and RL/include/reward (working tree, 2026-11-05 23:15). Every box with a page number jumps there; the math box jumps into the separate \"Math verifier, explained\" drawing."));
  els.push(plain(0, 210, 820, "After the model answers a prompt, a verifier compares the answer with the dataset's answer key and returns a score (usually 0 or 1). BluTrain has 7 verifier types behind one interface; a pool of reward threads runs them while generation continues, and the score lands on the last token of the trajectory for GRPO."));

  // architecture
  els.push(frame(0, 450, 1260, 940, "Architecture at a glance"));
  const cfg = box(30, 510, 330, 110, "reward: in the YAML\nverifiers: [{dataset, type}]\nnum_workers · timeout_s", "data", { size: 15, link: LINK.page(4) });
  const rw = box(30, 680, 330, 110, "RolloutWorker\ndecode tokens → TrajectoryData\nagent_loop_postprocess", "gray", { size: 15, link: LINK.page(2) });
  const loop = box(450, 640, 380, 150, "RewardLoopWorker  →  page 3\nthread pool (8) + timeout watchdog\nerror / timeout → score 0", "driver", { size: 15, link: LINK.page(3) });
  const reg = box(450, 510, 380, 90, "VerifierRegistry\ntype name → verifier instance", "driver", { size: 15, link: LINK.page(3) });
  els.push(cfg, rw, loop, reg, arrow(cfg, reg, "data"), arrow(rw, loop, "driver"), arrow(reg, loop, "driver"));
  const vs = [
    ["gsm8k · gsm8k_flexible", "rollout", 5],
    ["exact_match", "rollout", 6],
    ["short_response", "rollout", 6],
    ["math  ↗ own drawing", "reward", 7],
    ["ifeval · ifeval_all", "trainer", 8],
    ["code_exec · sandbox (stubs)", "gray", 11],
  ];
  const vb = vs.map(([n, k, pg], i) => box(920, 470 + i * 88 + 30, 310, 70, `${n}\n→ page ${pg}`, k, { size: 14, font: FONT.body, link: LINK.page(pg) }));
  els.push(...vb, text(920, 470, "Verifier::score(response, ground_truth)", { size: 14, bold: true, color: K.rollout.s }));
  for (const b of vb.slice(0, 5)) els.push(connect(loop, b, { stroke: K.driver.s, sw: 1.2, end: "triangle", rough: 0.5 }));
  const out = box(450, 860, 380, 120, "ScoreResult\nreward_score + extra_info\n{acc, pred, method, n_passed, error, …}", "trainer", { size: 15 });
  const tq = box(30, 1040, 330, 120, "TransferQueue row\nrm_scores[last token] = score\nextra_fields.reward_extra_info", "data", { size: 15, link: LINK.page(2) });
  const log = box(450, 1040, 380, 120, "rollouts_<pid>.jsonl\nreward · pred · method · timings", "gray", { size: 15, link: LINK.page(2) });
  const down = box(920, 1040, 310, 120, "ReplayBuffer DAPO filter\n+ GRPO advantage", "replay", { size: 15, link: LINK.page(4) });
  els.push(out, tq, log, down, arrow(loop, out, "trainer"), arrow(out, tq, "data"), arrow(out, log), arrow(tq, down, "replay"));
  els.push(note(30, 1200, 1200, "Real today: the loop, the registry, 7 verifier types, the TQ/log/DAPO wiring. Scaffolding: RewardLoopManager, RewardDispatchPolicy, CodeExecVerifier, SandboxFusionClient, reward models (page 11).", { size: 15, color: C.dim }));

  // page guide
  const RX = 1360;
  els.push(h2(RX, 450, "Page guide"));
  const guide = [
    [1, "driver", "Layers, the Verifier interface, data types, class map"],
    [2, "gray", "Swimlane of one rollout's reward; the TQ row and log line"],
    [3, "driver", "Thread pool, watchdog, error handling, the registry"],
    [4, "data", "reward: YAML keys, which configs use which type, downstream use"],
    [5, "rollout", "#### / \\boxed{} number match, strict and flexible"],
    [6, "rollout", "Whole-string match; the 800-char pipeline test"],
    [7, "reward", "Summary + links into the full math drawing"],
    [8, "trainer", "Answer cleanup, ground-truth JSON, fraction vs all-or-nothing"],
    [9, "trainer", "Every instruction id by category, with what it checks"],
    [10, "trainer", "The Python ports: punkt, word_tokenize, langdetect, str tables"],
    [11, "gray", "What throws, what's unused, what the docs plan"],
    [12, "data", "Per-verifier libraries, data, Makefile placement, tests"],
    [13, "sync", "16 known issues, most severe first"],
  ];
  guide.forEach(([pg, k, d], i) => els.push(card(RX, 510 + i * 70, 600, `${PAGE_NAMES[pg]} — ${d}`, k, { size: 14, link: pg === 7 ? LINK.page(7) : LINK.page(pg) })));

  // verifier summary table
  els.push(h2(0, 1450, "The 7 verifier types in one table"));
  const T = table(0, 1510, [{ w: 250, code: true }, { w: 300, code: true }, { w: 470 }, { w: 300 }, { w: 300 }, { w: 330 }], [
    ["type", "class", "checks", "score", "ground truth", "depends on"],
    ["gsm8k", "Gsm8kVerifier(false)", "last \"#### N\" or \"\\boxed{N}\" in the last 300 bytes", "1 / 0", "\"72\"", "<regex>"],
    ["gsm8k_flexible", "Gsm8kVerifier(true)", "last number in the last 300 bytes", "1 / 0", "\"72\"", "<regex>"],
    ["exact_match", "ExactMatchVerifier", "whole response == gt (spaces collapsed, lowercased)", "1 / 0", "any string", "<sstream>, <cctype>"],
    ["short_response", "ShortResponseVerifier", "response < 800 bytes (gt ignored)", "1 / 0", "ignored", "nothing"],
    ["math", "MathEquivalenceVerifier", "LaTeX → SymEngine equivalence", "1 / 0", "LaTeX answer", "SymEngine + GMP, <regex>"],
    ["ifeval", "IfEvalVerifier(false)", "fraction of instructions followed", "0 … 1", "JSON {instruction_id, kwargs}", "MiniJson, NLTK + langdetect ports, PyStr"],
    ["ifeval_all", "IfEvalVerifier(true)", "all instructions followed", "1 / 0", "same", "same"],
  ], { size: 14, firstCol: C.lGray });
  els.push(...T.els);
  return els;
}

// ======================================================================
// 1 · Architecture
// ======================================================================
function archPage() {
  const els = header(1, "Architecture", "Four layers, one interface, a handful of plain data types");
  els.push(plain(0, 200, 900, "Think of it as a factory line: the rollout worker packs each answer into a TrajectoryData, the reward loop picks the right checker for its dataset, the checker returns a ScoreResult, and the result is written where the trainer can find it."));
  els.push(h2(0, 420, "Layers"));
  const layers = [
    ["Wiring", "RolloutWorker (Ray actor) · RLConfig reward: · RolloutWorkerActor plumbing", "gray"],
    ["Loop", "RewardLoopWorker — async thread pool, timeout watchdog, error → 0, \"acc\" guaranteed", "driver"],
    ["Registry", "VerifierRegistry — type name → factory → cached instance; 7 built-ins", "driver"],
    ["Verifiers", "Gsm8k · ExactMatch · ShortResponse · MathEquivalence · IfEval  (+ CodeExec / SandboxFusion stubs)", "rollout"],
    ["Support libraries", "SymEngine/GMP (math) · NltkTokenize, Langdetect, PyStr + generated tables, MiniJson (IFEval)", "data"],
  ];
  layers.forEach(([n, d, k], i) => {
    els.push(rect(0, 480 + i * 100, 260, 84, { text: n, font: FONT.hand, size: 20, bg: K[k].b, stroke: K[k].s, sw: 2, rough: 0.6 }));
    els.push(card(280, 480 + i * 100, 900, d, k, { size: 16 }));
    if (i < layers.length - 1) els.push(text(120, 480 + i * 100 + 84, "▼", { size: 14, color: C.gray }));
  });

  els.push(h2(1260, 420, "The Verifier interface"));
  els.push(code(1260, 480, 700, "// include/reward/verifiers/Verifier.h\nclass Verifier {\n public:\n  virtual ScoreResult score(const std::string& response,\n                            const std::string& ground_truth) = 0;\n  virtual ScoreResult score_trajectory(const TrajectoryData& t) {\n    return score(t.response_text, t.ground_truth);\n  }\n};\n// shared by every reward thread: score() must be\n// safe to call concurrently (no mutable state)", { size: 14 }));
  els.push(note(1260, 780, 700, "score_trajectory is the extension point for checks that need the prompt, stop_reason or lengths (overlong penalties, LLM judges). No built-in verifier overrides it yet — only a test verifier does.", { size: 15, color: C.dim }));

  els.push(h2(0, 1010, "Data types  (include/reward/RewardTypes.h)"));
  const types = [
    ["ScoreResult", "float reward_score = 0\nunordered_map<string, TagValue> extra_info\nTagValue = variant<string, int64_t, double, bool>", "trainer"],
    ["TrajectoryData", "uid · session_id · data_source (routing key)\nprompt_text · response_text · ground_truth\nprompt_len · response_len · stop_reason (eos | length | stop_string)\ntruncated() = stop_reason == \"length\" · extra_info (never filled)", "data"],
    ["RewardResult", "ScoreResult score\ndouble wait_s · compute_s\n(the loop guarantees extra_info[\"acc\"], plus \"error\" or \"timeout\" on failure)", "driver"],
    ["DataBatch / RewardBatchResult", "vector<TrajectoryData> rows · vector<float> scores\n(only used by the stubbed RewardLoopManager)", "gray"],
  ];
  types.forEach(([n, d, k], i) => els.push(code((i % 2) * 990, 1070 + Math.floor(i / 2) * 200, 960, `${n}\n${d}`, { size: 14, bg: K[k].l, stroke: K[k].s })));

  els.push(h2(0, 1510, "Class map"));
  const base = box(760, 1570, 440, 90, "Verifier  (abstract)", "rollout", { size: 18 });
  const impls = [
    ["Gsm8kVerifier", "rollout", 5], ["ExactMatchVerifier", "rollout", 6], ["ShortResponseVerifier", "rollout", 6], ["MathEquivalenceVerifier", "reward", 7], ["IfEvalVerifier", "trainer", 8], ["CodeExecVerifier (stub)", "gray", 11],
  ];
  els.push(base);
  impls.forEach(([n, k, pg], i) => {
    const b = box(i * 330, 1740, 310, 70, n, k, { size: 15, font: FONT.body, link: LINK.page(pg) });
    els.push(b, connect(b, base, { stroke: C.gray, sw: 1.5, end: "triangle", rough: 0.4 }));
  });
  els.push(small(0, 1830, "SandboxFusionClient (stub) is not a Verifier: it would be the HTTP client CodeExecVerifier uses."));
  return els;
}

// ======================================================================
// 2 · One rollout, end to end
// ======================================================================
function e2ePage() {
  const els = header(2, "One rollout, end to end", "From generated tokens to the score the trainer reads — with the exact functions and fields");
  els.push(plain(0, 200, 900, "The session thread never waits for the grade: it hands the answer to the reward loop and moves on. When the grade is ready, a reward thread writes it into the TransferQueue row and the log, and the prompt's group is marked done."));
  const lanes = [["offline data", "data"], ["RolloutWorker session", "gray"], ["RewardLoopWorker thread", "driver"], ["Verifier", "rollout"], ["TQ / log / trainer", "trainer"]];
  const LX = 240, LH = 120, T0 = 440;
  lanes.forEach(([n, k], i) => {
    els.push(rect(0, T0 + i * LH, LX - 20, LH - 14, { text: n, font: FONT.body, size: 15, bold: true, bg: K[k].b, stroke: K[k].s, sw: 1.5, rough: 0.4 }));
    els.push(rect(LX, T0 + i * LH, 1720, LH - 14, { bg: K[k].l, stroke: K[k].s, sw: 1, rough: 0, round: false, opacity: 60 }));
  });
  const ev = (lane, x, w, str, link) => {
    const k = lanes[lane][1];
    const r = rect(LX + x, T0 + lane * LH + 12, w, LH - 38, { text: str, font: FONT.body, size: 13, bg: K[k].b, stroke: K[k].s, sw: 1.5, rough: 0.4, link });
    els.push(r);
    return r;
  };
  const a = ev(0, 10, 230, "gsm8k.py / dolci_think_rl.py → JSONL {prompt, input_ids, answer, data_source}");
  const b = ev(1, 260, 240, "PromptRow: ground_truth, data_source → generate → token_ids (EOS included)");
  const c = ev(1, 520, 250, "agent_loop_postprocess: drop ids ≥ 50257, Gpt2Detokenizer, TrajectoryData");
  const d = ev(2, 790, 220, "compute_score_async → verifier_for(data_source) → thread pool", LINK.page(3));
  const e = ev(3, 1030, 200, "score_trajectory → score(response, gt)");
  const f = ev(2, 1250, 200, "error → 0 · timeout → 0 · try_emplace(acc)");
  const g = ev(4, 1470, 240, "on_done → write_trajectory: log line + TQ row → settle");
  els.push(arrow(a, b, "data"), arrow(b, c), arrow(c, d, "driver"), arrow(d, e, "rollout"), arrow(e, f, "driver"), arrow(f, g, "trainer"));
  els.push(small(LX, T0 + 5 * LH, "The session thread returns right after compute_score_async. Later: ReplayBufferAsync DAPO filter → RLDriver sums rm_scores per row → GRPO advantage."));

  els.push(h2(0, 1140, "What the reward thread writes"));
  const toks = ["r0", "r1", "r2", "…", "r(R−2)", "r(R−1)"];
  toks.forEach((t, i) => els.push(rect(i * 120, 1210, 110, 50, { text: i === 5 ? "score" : "0", font: FONT.code, size: 15, bg: i === 5 ? C.bGreen : "#ffffff", stroke: C.gray, sw: 1, rough: 0, round: false })));
  els.push(text(740, 1222, "rm_scores [R] f32 — verl-style outcome reward on the last token", { size: 15, color: C.dim }));
  els.push(code(0, 1290, 960, "TQ row  <uid>_<session>_0  (partition \"train\")\n  prompts [P] · responses [R] · response_mask [R] · input_ids [P+R]\n  rollout_log_probs [R] · rm_scores [R]\n  extra_fields = {\"reward_extra_info\": {acc, pred, method, …}}\n    (keys sorted, doubles %.17g, non-finite → null)\n  tags: status=success · prompt_len · response_len · seq_len\n        global_steps · reward_wait_ms · reward_compute_ms", { size: 14 }));
  els.push(code(1000, 1290, 960, "rollouts_<pid>.jsonl, one line per trajectory\n  time · uid · session · birth_step\n  reward · gt · pred · method          (pred/method from extra_info)\n  stop · response_len · undecodable_ids · mean_logprob\n  reward_wait_ms · reward_compute_ms\n  [reward_error] · [reward_timeout]\n  prompt (session 0 only) · response", { size: 14 }));
  els.push(sticky(0, 1520, 1960, "The decoded response keeps its end-of-text token. Id 50256 is inside the 50,257-entry GPT-2 vocab (its last entry decodes to <|endoftext|>) and the engines append the EOS token before stopping — so every eos-terminated response_text ends with the literal text \"<|endoftext|>\". gsm8k and math don't mind; exact_match and several IFEval rules do (page 13, B2).", { size: 16, font: FONT.body, bg: C.bRed, link: LINK.page(13) }));
  els.push(files(0, 1680, 1400, "src/rollout_client/RolloutWorker.cpp — agent_loop_postprocess 218-257, write_trajectory 259-338 · include/reward/README.md"));
  return els;
}

// ======================================================================
// 3 · Reward loop & registry
// ======================================================================
function loopPage() {
  const els = header(3, "Reward loop & registry", "RewardLoopWorker runs verifiers asynchronously; VerifierRegistry turns type names into verifier instances");
  els.push(plain(0, 200, 900, "A small pool of reward threads grades answers in the background. If a checker crashes or takes too long, the answer simply scores 0 and training goes on. The registry is a phone book: \"gsm8k\" → the gsm8k checker."));
  els.push(h2(0, 420, "RewardLoopWorker (206 lines)"));
  ladder(els, 0, 480, 960, [
    ["constructor — optional register_extra(registry) hook (tests; verl's custom reward function), then registry.get(type) for every reward.verifiers entry → by_dataset_[dataset]. Unknown type → invalid_argument listing the known types. Duplicate dataset: last one wins silently.", "driver"],
    ["num_workers > 0 → ThreadPool(num_workers) (+ Watchdog thread if timeout_s > 0). num_workers = 0 → score inline on the caller (timeout_s ignored, with a warning).", "driver"],
    ["compute_score_async(traj, on_done) — verifier_for(data_source) throws before queuing if there's no entry; else enqueue run_job; the deadline is queued_at + timeout_s (queue wait counts).", "driver"],
    ["run_job — skip if a timeout already finished it; score_trajectory(); std::exception → ScoreResult{} with error = e.what(); then try_emplace(\"acc\", reward_score) — a verifier's own acc survives.", "rollout"],
    ["finish — atomic exchange: the first of {result, timeout} wins; an exception thrown by on_done is caught and logged so the pool thread survives.", "trainer"],
  ]);
  // watchdog timeline
  els.push(h2(1060, 420, "Watchdog, on a timeline"));
  els.push(harrow(1080, 1940, 640, { stroke: C.dim, sw: 1.5 }), label(1900, 648, "time"));
  els.push(rect(1080, 520, 220, 50, { text: "queued", font: FONT.body, size: 14, bg: C.lGray, stroke: C.gray, sw: 1, rough: 0.3 }));
  els.push(rect(1300, 520, 500, 50, { text: "verifier running (too slow)", font: FONT.body, size: 14, bg: C.bBlue, stroke: C.blue, sw: 1, rough: 0.3 }));
  els.push(poly([{ x: 1600, y: 500 }, { x: 1600, y: 660 }], { stroke: C.red, sw: 2.5, dash: "dashed" }), text(1610, 660, "queued_at + timeout_s", { size: 14, color: C.red }));
  els.push(rect(1600, 580, 200, 46, { text: "→ 0, timeout: true", font: FONT.code, size: 13, bg: C.bRed, stroke: C.red, sw: 1, rough: 0.3 }));
  els.push(note(1060, 700, 900, "One watchdog thread with a min-heap of (deadline, weak_ptr<Job>). On expiry: reward 0, extra_info {timeout: true, acc: 0.0}, a stderr line; the late real result is dropped. Timeout callbacks run one at a time on that thread. Default timeout_s = 0 → no deadline.", { size: 15, color: C.dim }));
  els.push(card(1060, 880, 900, "Destructor: pool_.reset() drains every queued job (their on_done still runs), then the watchdog joins. Blocking helpers compute_score / compute_score_batch wrap the async call with promise/future — never call them from on_done.", "driver", { size: 15 }));

  els.push(h2(0, 1260, "VerifierRegistry (src/reward/verifiers/VerifierRegistry.cpp, 77 lines)"));
  const T = table(0, 1320, [{ w: 240, code: true }, { w: 520, code: true }, { w: 300 }], [
    ["type", "registered as", "page"],
    ["gsm8k", "make<Gsm8kVerifier>(false)", "5"],
    ["gsm8k_flexible", "make<Gsm8kVerifier>(true)", "5"],
    ["exact_match", "make<ExactMatchVerifier>()", "6"],
    ["math", "make<MathEquivalenceVerifier>()", "7"],
    ["ifeval", "make<IfEvalVerifier>()", "8"],
    ["ifeval_all", "make<IfEvalVerifier>(true)", "8"],
    ["short_response", "make<ShortResponseVerifier>()  (defined in this file)", "6"],
  ], { size: 14 });
  els.push(...T.els);
  els.push(card(1120, 1320, 840, "How it works\n• Registered explicitly in the constructor — no static self-registration, because objects nothing references are dropped when linking from librl.a.\n• get(type) builds lazily, caches, returns nullptr if unknown; register_verifier replaces and drops the cached instance; types() is sorted.\n• Factories receive the RewardConfig, but make<V>() ignores it — no verifier reads config yet.\n• Not thread-safe: everything is resolved in the constructor, before scoring starts.\n• Not registered: code_exec, sandbox_fusion, math_equivalence.", "driver", { size: 15 }));
  els.push(h2(0, 1700, "Tests  (test_reward_loop.cpp, all passing)"));
  const tests = ["200 async jobs: each callback once, off the caller thread", "inline mode runs on the caller", "unknown data_source throws, no callback", "verifier throws → error \"boom\", score 0", "0.05 s timeout vs a 300 ms verifier → one callback, timeout: true", "stop_reason length scores 0 (score_trajectory); batch order kept", "destructor drains the queue (6/6)", "a throwing callback is contained", "registry: 7 types, caching, unknown → nullptr, replacement"];
  tests.forEach((t, i) => els.push(card((i % 3) * 660, 1760 + Math.floor(i / 3) * 84, 640, t, "trainer", { size: 14 })));
  return els;
}

// ======================================================================
// 4 · Config & wiring
// ======================================================================
function configPage() {
  const els = header(4, "Config & wiring", "The reward: section, which run configs use which verifier, and who reads the scores afterwards");
  els.push(plain(0, 200, 900, "A run's YAML lists which checker to use for each dataset name. Pick the wrong name and the rollout worker won't start; forget a dataset and its prompts silently fail."));
  els.push(code(0, 420, 960, "reward:                                  # RLConfig.h 263-291, parser 372-401\n  mode: rule_based            # rule_based | model — \"model\" only triggers validation\n  num_workers: 8              # reward threads per RolloutWorker; 0 = inline\n  timeout_s: 0.0              # 0 = no deadline\n  verifiers:                  # replaces the default list entirely\n    - {dataset: gsm8k, type: gsm8k}   # dataset = the row's data_source value\n  detokenizer_vocab: lib/gpt2_vocab.b64   # required to decode responses\n  sandbox_fusion: {url, max_concurrent: 64, memory_limit_mb: 1024}   # parsed, unused\n  model: {path, enable_resource_pool: true}                          # parsed, unused\nfilter_groups: {enable: false, metric: reward}   # DAPO filter (replay buffer)\ndata: {reward_fn_key: data_source}              # JSONL column → PromptRow.data_source", { size: 14 }));
  els.push(card(1000, 420, 960, "Plumbing\nRLDriver.cpp:168-175 creates each RolloutWorkerActor with reward.verifiers, detokenizer_vocab, rollout_data_dir, num_workers, timeout_s. RolloutWorkerActor.cpp:49-54 rebuilds RewardConfig from flat vectors — so mode, sandbox_fusion and model are not forwarded. RewardLoopManager is passed as an invalid handle (id 0).", "data", { size: 15 }));

  els.push(h2(0, 820, "Run configs, by verifier type"));
  const T = table(0, 880, [{ w: 520, code: true }, { w: 360, code: true }, { w: 520 }], [
    ["config", "dataset → type", "notes"],
    ["grpo_135m_gsm8k.yaml", "gsm8k → gsm8k_flexible", "filter_groups off"],
    ["grpo_135m_sft_gsm8k.yaml · grpo_135m_oneshot_104.yaml", "gsm8k → gsm8k", ""],
    ["grpo_1p5b_gsm8k.yaml · _1000 · _cont100", "gsm8k → gsm8k", "\"strict: last #### N or \\boxed{N}\"; filter_groups on"],
    ["grpo_1p5b_sanity_short.yaml", "gsm8k → short_response", "framework test"],
    ["grpo_135m_ifeval.yaml", "ifeval → ifeval", "data from dolci_think_rl.py --data_sources ifeval"],
    ["gpt2_single_validate.yaml", "gsm8k → exact_match", "num_workers 1; no detokenizer_vocab (B4)"],
    ["grpo_rlvr.yaml", "math_rlvr → math_equivalence, code_rlvr → code_exec", "neither type is registered (B1)"],
    ["(none)", "→ math", "no YAML uses the math type yet"],
  ], { size: 14 });
  els.push(...T.els);

  els.push(h2(1460, 820, "Who reads the score"));
  els.push(card(1460, 880, 500, "ReplayBufferAsync::dapo_filtered\nWith filter_groups.enable (not on val): metric \"reward\" = sum of rm_scores; any other metric = extra_fields.reward_extra_info[metric] (number or bool). Groups with >1 row and all-identical values are evicted. With IFEval, acc and n_passed work as metrics.", "replay", { size: 14 }));
  els.push(card(1460, 1120, 500, "RLDriver::compute_advantage\nSums rm_scores per row → GRPO outcome score, groups by uid prefix, logs reward/mean and reward/groups. Timing: timing/reward_wait_ms and reward_compute_ms (mean, max).", "trainer", { size: 14 }));
  els.push(files(0, 880 + T.h + 30, 1400, "include/config/RLConfig.h · src/config/RLConfigParser.cpp · src/replay_buffer/ReplayBufferAsync.cpp · src/driver/RLDriver.cpp · scripts/config/*.yaml"));
  return els;
}

// ======================================================================
// 5 · gsm8k
// ======================================================================
function gsm8kPage() {
  const els = header(5, "gsm8k", "Gsm8kVerifier(bool flexible) — a port of verl's gsm8k.py with one BluTrain addition");
  els.push(plain(0, 200, 900, "Finds the model's final number and compares it with the answer key as text. Strict mode wants \"#### 72\" or \\boxed{72}; flexible mode takes the last number anywhere. \"72\" and \"72.0\" are different strings, so the second fails."));
  els.push(h2(0, 420, "Algorithm  (src/reward/verifiers/Gsm8kVerifier.cpp, 58 lines)"));
  flow(els, 0, 490, 300, 120, 40, [
    ["tail = last 300 BYTES of the response", "rollout"],
    ["strict: (?:#### |\\\\boxed\\{)(\\-?[0-9\\.\\,]+)\nflexible: (\\-?[0-9\\.\\,]+)", "rollout", { font: FONT.code, size: 13 }],
    ["strict: last match\nflexible: last that isn't \"\" or \".\"", "rollout"],
    ["clean_number on pred AND gt: drop , $ space tab", "data"],
    ["equal strings → 1.0\nelse 0.0\nextra_info: acc, pred", "trainer"],
  ]);
  els.push(card(0, 660, 960, "Ground truth: data_preprocess/gsm8k.py::extract_final_answer splits the reference on \"####\\s*\", keeps the last part, strips it and removes commas → \"72\". gsm8k_chat.py re-templates the prompt (chat template + \\boxed{} instruction) and keeps the answer.", "data", { size: 15 }));
  els.push(card(1000, 660, 960, "Differences from verl's gsm8k.py\n• strict also accepts \\boxed{N} — added when the 1.5B model ignored \"####\" (GRPO_1P5B_REPORT.md bug 4)\n• flexible also drops , and $; the ground truth is cleaned too (verl compares it raw)\n• no format_score — always 0 when wrong · the window is bytes, not characters", "rollout", { size: 15 }));
  els.push(h2(0, 880, "Examples"));
  const E = exTable(0, 940, [{ w: 520, code: true }, { w: 120, code: true }, { w: 160 }, { w: 120, code: true }, { w: 400 }, { w: 100 }], [
    ["response (tail)", "gt", "mode", "pred", "why", "score"],
    ["48/2 = 24 in May, 48+24 = 72.\\n#### 72", "72", "strict [TEST]", "72", "", "1", true],
    ["#### 10\\nlater #### 72", "72", "strict [TEST]", "72", "last match wins", "1", true],
    ["so the answer is \\(\\boxed{72}\\).", "72", "strict [TEST]", "72", "\\boxed form", "1", true],
    ["…\\n#### 72<|endoftext|>", "72", "strict [RAN]", "72", "EOS text is harmless here", "1", true],
    ["the answer is 72", "72", "strict [TEST]", "", "no #### or \\boxed", "0", false],
    ["#### 72.", "72", "strict [RAN]", "72.", "trailing . captured", "0", false],
    ["\\boxed{ 72 }", "72", "strict [RAN]", "", "digit must follow {", "0", false],
    ["#### 1.50", "1.5", "strict [RAN]", "1.50", "string compare", "0", false],
    ["#### 72 + 400 × 'x'", "72", "strict [TEST]", "", "outside the 300-byte tail", "0", false],
    ["so she sold 72 clips.", "72", "flexible [TEST]", "72", "", "1", true],
    ["The answer is 72.", "72", "flexible [RAN]", "72.", "the period sticks", "0", false],
    ["The answer is 72 apples, I think", "72", "flexible [RAN]", "", "a lone \",\" is the last \"number\"", "0", false],
  ], 14);
  els.push(...E.els);
  els.push(files(0, 940 + E.h + 20, 1400, `${V}Gsm8kVerifier.cpp · include/reward/verifiers/Gsm8kVerifier.h · data_preprocess/{gsm8k,gsm8k_chat}.py`));
  return els;
}

// ======================================================================
// 6 · exact_match & short_response
// ======================================================================
function smallPage() {
  const els = header(6, "exact_match & short_response", "The two simplest verifiers: a whole-string comparison, and a pipeline sanity test");
  els.push(plain(0, 200, 900, "exact_match says yes only if the entire response, ignoring case and extra spaces, equals the answer. short_response ignores the answer and rewards replies under 800 bytes — useful to prove the training loop works, not to teach anything."));
  els.push(h2(0, 420, "ExactMatchVerifier  (exact_match, 38 lines)"));
  flow(els, 0, 490, 320, 100, 40, [
    ["split on whitespace (istringstream)", "rollout"],
    ["tolower each word (ASCII / locale)", "rollout"],
    ["join with single spaces", "rollout"],
    ["equal → 1.0, else 0.0\nno extra_info at all", "trainer"],
  ]);
  const E = exTable(0, 650, [{ w: 400, code: true }, { w: 220, code: true }, { w: 380 }, { w: 100 }], [
    ["response", "gt", "why", "score"],
    ["  The Answer  ", "the answer", "[TEST] spaces and case ignored", "1", true],
    ["  The   ANSWER\\n", "the answer", "[RAN]", "1", true],
    ["wrong", "the answer", "[TEST]", "0", false],
    ["Paris.", "paris", "[RAN] punctuation kept", "0", false],
    ["72<|endoftext|>", "72", "[RAN] decoded EOS (B2)", "0", false],
  ], 15);
  els.push(...E.els);
  els.push(card(1160, 650, 800, "Notes\n• No pred, so the rollout log's pred column is empty (B7); acc is added by the loop.\n• Used as the stand-in reward in test_rl_tq_end_to_end.cpp and by gpt2_single_validate.yaml on GSM8K — where whole-completion exact match is almost always 0.\n• Every eos-terminated completion fails it until <|endoftext|> is stripped.", "rollout", { size: 15 }));

  els.push(h2(0, 1000, "ShortResponseVerifier  (short_response, in VerifierRegistry.cpp)"));
  els.push(code(0, 1060, 960, "static constexpr size_t kShortChars = 800;\nreward_score = response.size() < kShortChars ? 1.0f : 0.0f;\nextra_info[\"acc\"]  = reward_score;\nextra_info[\"pred\"] = std::to_string(response.size()) + \" chars\";", { size: 15 }));
  const E2 = exTable(0, 1230, [{ w: 300, code: true }, { w: 260, code: true }, { w: 100 }], [
    ["response", "pred", "score"],
    ["799 × 'a'  [RAN]", "799 chars", "1", true],
    ["800 × 'a'  [RAN]", "800 chars", "0", false],
  ], 15);
  els.push(...E2.els);
  els.push(...bars(1060, 1080, 600, 240, 0, 0.8, [
    { v: 0.35, top: "0.35", label: "reward, step 0", color: C.bGray },
    { v: 0.63, top: "0.63", label: "reward, step 40", color: C.bGreen },
  ]));
  els.push(note(1060, 1370, 900, "Why it exists: a trivially learnable reward independent of math ability. Per GRPO_1P5B_REPORT.md, with grpo_1p5b_sanity_short.yaml reward rose 0.35 → 0.63 and mean length fell 300 → 230 tokens over 40 steps, repeated 4 times — proof that the RL loop updates the policy. Counts bytes, including the 13-byte <|endoftext|>.", { size: 15, color: C.dim }));
  els.push(files(0, 1480, 1400, `${V}ExactMatchVerifier.cpp · ${V}VerifierRegistry.cpp (ShortResponseVerifier, lines 20-35) · scripts/config/grpo_1p5b_sanity_short.yaml`));
  return els;
}

// ======================================================================
// 7 · math
// ======================================================================
function mathPage() {
  const els = header(7, "math", "MathEquivalenceVerifier — summarized here; the full explanation is its own drawing");
  els.push(plain(0, 200, 900, "The math checker reads LaTeX answers like a careful teacher: it knows \\frac{1}{2} = 0.5, that sets don't care about order, and that x+1 = (x²−1)/(x−1). It is big enough to have its own 10-page drawing — the button below opens it."));
  els.push(rect(0, 430, 900, 120, { text: "↗  Open \"Math verifier, explained\"  (10 pages)", font: FONT.display, size: 30, bg: C.bOrange, stroke: C.orange, sw: 3, rough: 0.8, link: MATH(0), color: C.ink }));
  els.push(small(0, 560, "Click in view mode (Ctrl+click while editing). Alt+← comes back here."));
  els.push(h2(0, 640, "Jump straight to a page of the math drawing"));
  const pages = [
    [1, "Extraction — six strategies"], [2, "Normalization — every rule"], [3, "Structure — sets, tuples, ±"], [4, "Relations & expressions"], [5, "Lexer & parser"], [6, "Comparison — exact, rtol, probing"], [7, "Methods & 26 examples"], [8, "Parity with math-verify"], [9, "Bugs, limits & files"],
  ];
  pages.forEach(([p, n], i) => els.push(card((i % 3) * 300, 700 + Math.floor(i / 3) * 80, 285, `${p} · ${n}  ↗`, "reward", { size: 15, link: MATH(p) })));

  const RX = 1000;
  els.push(h2(RX, 420, "In this system"));
  els.push(card(RX, 480, 960, "Registered as type \"math\" (VerifierRegistry). Runs on the reward threads like every verifier; its own try/catch maps any exception to method \"error\", score 0. Writes extra_info acc, pred and method — the method column of rollouts_<pid>.jsonl is filled only by this verifier. Not affected by the decoded <|endoftext|> (verified). No run config uses it yet; grpo_rlvr.yaml asks for math_equivalence, which isn't registered.", "reward", { size: 15 }));
  els.push(card(RX, 720, 960, "Dependencies\n• SymEngine (static, -fPIC, WITH_SYMENGINE_THREAD_SAFE=ON, default ~/.local/symengine) + GMP — Makefile 75-85 (SYMENGINE_LIBS appended to LDLIBS and the worker .so link)\n• <regex> · MiniJson only for the CLI\n• make math_verifier_cli: verifier + MiniJson + SymEngine, no CUDA/Ray — used by scripts/math_verifier_parity.py and math_verifier_metamorphic.py", "data", { size: 15 }));
  els.push(h2(0, 1000, "The pipeline in one line"));
  flow(els, 0, 1060, 280, 100, 30, [
    ["extract\n\\boxed · Answer: · $…$ · last number", "rollout", { size: 14 }],
    ["normalize\nunits, \\text, unicode", "data", { size: 14 }],
    ["structure\nsets · tuples · intervals", "replay", { size: 14 }],
    ["parse\nLaTeX → SymEngine", "reward", { size: 14 }],
    ["compare\nexact · rtol · probing", "trainer", { size: 14 }],
    ["method\nstring/sym/choice/…", "gray", { size: 14 }],
  ]);
  els.push(card(0, 1220, 1960, "As of the 16:57 source (1671 lines, 147 score assertions): exact decimals must be identical unless one has more than 6 places and they agree to ~1e-6; probing uses 7 fixed points with rtol 1e-9 (1e-4 when a side contains a written decimal); answers up to 1024 characters are parsed (kMaxAnswerLen). Still open: \"dog\" = \"god\", the % retry, same-letter choice with an unparsable value — all detailed in the math drawing.", "reward", { size: 15, link: MATH(6) }));
  return els;
}

// ======================================================================
// 8 · IFEval: how it scores
// ======================================================================
function ifevalPage() {
  const els = header(8, "IFEval: how it scores", "IfEvalVerifier(bool all_or_nothing) — a C++ port of open-instruct's IFEvalVerifier over the IFEvalG constraint set");
  els.push(plain(0, 200, 900, "Instruction-following prompts come with rules like \"no commas\", \"mention 'ocean'\", \"under 100 words\". The verifier checks each rule on the final answer and returns the fraction followed (ifeval) or 1 only if all are followed (ifeval_all)."));
  els.push(h2(0, 420, "Ground truth: Python literal → JSON, offline"));
  els.push(code(0, 480, 960, "Dolci row:  \"[{'instruction_id': ['keywords:existence'],\n              'kwargs': [{'keywords': ['ocean']}]}]\"     # a Python literal\n\ndolci_think_rl.py::ifeval_ground_truth_to_json\n  ast.literal_eval → unwrap a 1-element list → json.loads if it's a string\n  → require equal-length non-empty instruction_id / kwargs → json.dumps\n\nstored:     {\"instruction_id\": [\"keywords:existence\"],\n             \"kwargs\": [{\"keywords\": [\"ocean\"]}]}", { size: 14 }));
  els.push(card(1000, 480, 960, "Why offline: the C++ side reads JSON with MiniJson only. Unparseable rows are skipped and counted; --data_sources ifeval keeps only IF rows (every data_source in the file needs a reward.verifiers entry). Without the conversion every row scores 0 with error \"ground_truth is not JSON\".", "data", { size: 15 }));

  els.push(h2(0, 800, "score(response, ground_truth)  (IfEvalVerifier.cpp 1206-1264)"));
  ladder(els, 0, 860, 960, [
    ["parse ground truth (object or 1-element list) — not JSON / empty / missing lists → 0 with an error message", "data"],
    ["clean_answer: drop <|assistant|>, strip, keep text after the LAST </think>, drop <answer> / </answer>, strip  (<|endoftext|> is NOT removed)", "trainer"],
    ["n = min(len(ids), len(kwargs))  (Python zip) — empty answer or n = 0 → 0", "trainer"],
    ["each constraint → Pass / Fail / BadArgs / Unknown; only Pass counts — a broken rule never earns free reward", "trainer"],
    ["ifeval = passed / n   ·   ifeval_all = 1 if passed == n else 0", "trainer"],
  ]);
  els.push(code(1000, 860, 960, "extra_info\n  n_constraints, n_passed        int64\n  pred           \"2/3 failed: punctuation:no_comma\"\n  failed_ids · unknown_ids · bad_args_ids   (only if non-empty)\n  error          (bad ground truth)\n  acc            added by the loop (= the fraction)", { size: 14 }));
  els.push(card(1000, 1060, 960, "Strict only: Google IFEval's \"loose\" variants (drop first/last line, remove *) are not implemented. kwargs: missing and null are the same; numbers are doubles; \"less than\" → <, \"at least\" → >=; counts that Python reads with \"if not x\" are BadArgs at 0.", "trainer", { size: 15 }));

  els.push(h2(0, 1330, "Examples  — gt3 = {no_comma, existence[ocean], number_words < 100}"));
  const E = exTable(0, 1390, [{ w: 620, code: true }, { w: 160 }, { w: 160 }, { w: 520 }, { w: 120 }], [
    ["response", "ifeval", "ifeval_all", "why", "tag"],
    ["The ocean is calm, blue.", "0.667", "0", "comma breaks no_comma", "[TEST]", true],
    ["<think>a, b, c, no ocean</think> The ocean is calm.", "1", "1", "reasoning ignored", "[TEST]", true],
    ["<answer>The ocean.</answer>", "1", "1", "tags stripped", "[TEST]", true],
    ["<think>thinking only</think>", "0", "0", "empty answer", "[TEST]", false],
    ["gt as a Python literal", "0", "0", "error: ground_truth is not JSON", "[RAN]", false],
    ["ids [no_comma, quotation], kwargs [null]; \"Hi there\"", "1", "1", "zip drops quotation (B8)", "[RAN]", true],
  ], 14);
  els.push(...E.els);
  els.push(files(0, 1390 + E.h + 20, 1400, `${V}IfEvalVerifier.cpp (1266 lines) · include/reward/verifiers/IfEvalVerifier.h · data_preprocess/dolci_think_rl.py · tests/unit/test_if_verifier.cpp`));
  return els;
}

// ======================================================================
// 9 · IFEval: the 54 rules
// ======================================================================
function rulesPage() {
  const els = header(9, "IFEval: the 54 rules", "Every instruction id the verifier knows, grouped by family — 25 from Google IFEval, 29 from IFEvalG (Tulu / OLMo training constraints)");
  els.push(plain(0, 200, 900, "Each rule is a small check on the answer text. Some just look for a character, some count words or sentences (using a port of NLTK), a few detect the language (a port of langdetect). Matching is case-sensitive unless marked ci."));
  const groups = [
    ["keywords (10)", [
      "existence {keywords} — each appears, ci substring",
      "frequency {keyword, frequency, relation} — ci count < / ≥ (also word_count_different_numbers)",
      "forbidden_words — none as a whole word, ci",
      "letter_frequency {letter, let_frequency, let_relation}",
      "word_once {keyword} — ci count == 1",
      "exclude_word_harder — \" kw \" never appears",
      "no_adjacent_consecutive — no two adjacent words start with consecutive letters",
      "palindrome — some word reads the same reversed",
      "keyword_specific_position {keyword, n, m} — token m of sentence n",
      "start_end — first and last word tokens equal (ci), ≥ 2 tokens",
    ]],
    ["length_constraints (4)", [
      "number_sentences {num_sentences, relation} — punkt sentences",
      "number_paragraphs {num_paragraphs} — split on ***",
      "number_words {num_words, relation} — \\w+ runs",
      "nth_paragraph_first_word {num_paragraphs, nth_paragraph, first_word}",
    ]],
    ["detectable_format (9)", [
      "number_bullet_lists {num_bullets} — lines starting * or -",
      "constrained_response — \"My answer is yes/no/maybe.\"",
      "number_highlighted_sections {num_highlights} — *x* and **x**",
      "multiple_sections {section_spliter, num_sections}",
      "json_format — strict JSON after stripping ``` fences",
      "title — <<a title>> on one line",
      "square_brackets — every word wrapped in [ ]",
      "bigram_wrapping — <<word word>> pairs",
      "sentence_hyphens — sentences joined by - with no spaces",
    ]],
    ["detectable_content (2)", ["number_placeholders {num_placeholders} — [...] spans", "postscript {postscript_marker} — P.S. / P.P.S"]],
    ["paragraphs (2)", ["paragraphs — exactly 2 *** paragraphs", "paragraphs2 — exactly 2 blank-line paragraphs"]],
    ["combination (2)", ["two_responses — two different parts split by ******", "repeat_prompt {prompt_to_repeat} — answer starts with the prompt"]],
    ["startend (2)", ["end_checker {end_phrase} — ends with it (ci)", "quotation — wrapped in \" \""]],
    ["punctuation (3)", ["no_comma", "punctuation_dot — no .", "punctuation_exclamation — no !"]],
    ["copy (4) + new (1)", ["copy:repeat_phrase {phrase, small_n} — n copies, one word changed each", "copy:copy · copy:copying_simple {prompt_to_repeat} — equal (ci)", "copy:copying_multiple {prompt_to_repeat, N} — N copies split by ******", "new:copy_span_idx {prompt_to_repeat, n_start, n_end} — a slice of the prompt"]],
    ["first_word / last_word (4)", ["first_word_answer {first_word}", "first_word_sent — every sentence starts with it", "last_word_answer {last_word}", "last_word_sent — every sentence ends with it"]],
    ["count (4)", ["lowercase_counting {N} — no lowercase word more than N times", "count_increment_word {keyword1, keyword2} — once and twice", "counting_composition {n_sent, n_words} — 3 paragraphs × n sentences × n words", "count_unique — no repeated word"]],
    ["letters (2)", ["letter_counting {N, relation} — letters (str.isalpha)", "letter_counting2 — alias of letter_frequency"]],
    ["change_case (3)", ["capital_word_frequency {capital_frequency, capital_relation}", "english_capital — all caps AND langdetect = en", "english_lowercase — all lowercase AND langdetect = en"]],
    ["language (1)", ["response_language {language} — langdetect == ISO code"]],
  ];
  const cols = [0, 660, 1320];
  const colY = [420, 420, 420];
  for (const [g, items] of groups) {
    const c = colY.indexOf(Math.min(...colY));
    const r = card(cols[c], colY[c], 640, `${g}\n${items.map((s) => "• " + s).join("\n")}`, "trainer", { size: 14 });
    els.push(r);
    colY[c] += r.height + 24;
  }
  const by = Math.max(...colY) + 30;
  els.push(card(0, by, 1960, "Phases (from the code comments): 42 rules need no tokenizer, 9 use punkt / the IFEvalG regex sentence splitter / word_tokenize, 3 use langdetect. test_if_verifier.cpp has 128 rule-level pass/fail checks covering all 54 ids, with expected values produced by running the Python reference (nltk 3.10, langdetect seed 0).", "trainer", { size: 15 }));
  els.push(note(0, by + 110, 1960, "Rule examples [TEST]: keywords:frequency \"concatenate\" with cat ≥ 1 → Pass (substring) · forbidden_words \"pineapples\" vs apples → Pass (whole word) · json_format {\"a\": 01} → Fail · copy:repeat_phrase with no word changed → Fail · response_language \"12345 !!!\" → Fail (no features).", { size: 15, color: C.dim }));
  return els;
}

// ======================================================================
// 10 · IFEval: NLTK, langdetect, PyStr
// ======================================================================
function portsPage() {
  const els = header(10, "IFEval: NLTK, langdetect, PyStr", "IFEval's Python dependencies, re-implemented in C++ so results match the reference exactly");
  els.push(plain(0, 200, 900, "Python's IFEval leans on three libraries: NLTK to split sentences and words, langdetect to guess the language, and Python's own string rules. BluTrain re-wrote each in C++ with data tables dumped from Python, so the same text gets the same verdict."));
  const comp = [
    ["NltkTokenize.cpp (562 lines)", "PunktEnglishData.inc — 20,620 lines (239 KB): abbrev_types 155, collocations 36, sent_starters 38, ortho_context 20,365", "sent_tokenize: Punkt (inference only, realign_boundaries) — period contexts, first pass (sentbreak, ellipsis, abbreviation), second pass (collocations, orthographic heuristic, sentence starters).\nword_tokenize: NLTKWordTokenizer rules in order — starting quotes, punctuation, brackets, double dashes, ending quotes ('s 'll n't …), contractions (can|not, gon|na, wan|na, 't|is …). Each re.sub is a hand-written scanner: std::regex has no lookbehind or Unicode \\w."],
    ["Langdetect.cpp (365 lines)", "LangdetectData.inc — 184,357 lines (1.86 MB): 55 language profiles + normalization tables", "langdetect 1.0.9: strip URLs/emails, normalize (Vietnamese diacritics, CJK classes), 1-3-gram extraction (skipped inside ALL-CAPS words), 7 trials with CPython's MT19937 seeded 0 + random.gauss, Neumaier-compensated normalization every 5 steps, stop at p > 0.99999 or 1000 iterations; best language above 0.1."],
    ["PyStr.h (190 lines)", "PyStrTables.inc — 794 lines (99 KB), dumped from Python 3.12.13 / unicodedata 15.0.0 / regex 2026.9.29", "Python str semantics on UTF-8: decode (bad bytes → U+FFFD) and encode; re-module and regex-module \\w \\d \\s; isalpha / isalnum / isupper / islower / istitle; single-code-point lower; strip, sub, replace_all, split."],
  ];
  comp.forEach(([n, data, d], i) => {
    const y = 420 + i * 330;
    const src = box(0, y, 380, 110, n, "trainer", { size: 17 });
    const tbl = box(0, y + 140, 380, 130, data, "data", { size: 13, font: FONT.body });
    els.push(src, tbl, arrow(src, tbl, "data"));
    els.push(card(440, y, 1520, d, "trainer", { size: 15 }));
  });
  els.push(h2(0, 1440, "Examples"));
  const E = table(0, 1500, [{ w: 640, code: true }, { w: 760 }, { w: 120 }], [
    ["input", "result", "tag"],
    ["I can't do it, won't you? They're gonna say 'hello' (maybe).", "I ca n't do it , wo n't you ? They 're gon na say ' hello ' ( maybe ) .", "[TEST]"],
    ["Dr. Smith arrived at 3 p.m. today. He said: wow! Is it e.g. fine?", "punkt: 4 sentences, splitting after \"e.g.\" — the IFEvalG regex splitter gives 3", "[RAN]"],
    ["Bonjour, comment allez-vous aujourd'hui? · Hola, ¿cómo estás?", "fr · es", "[RAN]"],
    ["THE QUICK BROWN FOX", "vi — ALL-CAPS words are skipped, so too few n-grams remain", "[RAN]"],
    ["SURE THING BOSS", "de → change_case:english_capital fails", "[TEST]"],
    ["12345 !!!", "no features → response_language fails (Python IFEval counts it as passed)", "[TEST]"],
  ], { size: 14 });
  els.push(...E.els);
  els.push(sticky(1560, 1440, 400, "Missing from the repo: the generator scripts for all three .inc tables — only header comments describe how they were dumped (B14).", { size: 15, font: FONT.body, bg: C.bRed }));
  els.push(h2(0, 1500 + E.h + 50, "Deliberate differences from the Python reference"));
  const diffs = [
    "keywords, phrases and markers are matched literally (Python treats them as regexes: \"c++\" raises, \".\" matches anything) — postscript keeps . as a wildcard",
    "missing / null kwargs and 0 counts are BadArgs (fail) — Python's build_description would draw random values",
    "unknown ids and bad kwargs fail that one constraint — Python's verifier crashes",
    "langdetect \"no features\" is a Fail (IFEval returns True) and is deterministic (seed 0, sorted profiles)",
    "case folding for keyword search is ASCII-only; other comparisons use Unicode single-character lower",
    "strict only — no loose mode · ground truth must be JSON (conversion moved offline)",
  ];
  diffs.forEach((d, i) => els.push(card((i % 2) * 990, 1500 + E.h + 110 + Math.floor(i / 2) * 100, 970, d, "trainer", { size: 14 })));
  return els;
}

// ======================================================================
// 11 · Scaffolding
// ======================================================================
function scaffoldPage() {
  const els = header(11, "Scaffolding", "What's real, what throws, what's built but unused — and the architecture the docs plan next");
  els.push(plain(0, 200, 900, "Some reward classes are placeholders for later work: they exist so the design compiles, but calling them throws \"not implemented yet\". This page separates them from what actually runs."));
  const T = table(0, 420, [{ w: 380, code: true }, { w: 260 }, { w: 1320 }], [
    ["component", "status", "details"],
    ["RewardLoopWorker", "real", "the async loop (page 3)"],
    ["VerifierRegistry + 7 verifiers", "real", "pages 3, 5-10"],
    ["RewardLoopManager", "throws", "init_reward_loop_workers / compute_rm_score → logic_error \"not implemented yet (scaffolding only)\"; driver passes it as handle id 0"],
    ["CodeExecVerifier", "throws", "score → \"not implemented yet (P3, scaffolding only)\"; not registered"],
    ["SandboxFusionClient", "throws", "execute → \"not implemented yet (P3)\"; the HTTP client library choice is deferred"],
    ["RewardDispatchPolicy", "real, unused", "select_streaming_worker = std::rand() % n (verl's random.choice); chunk_for_colocated = round-robin i % n"],
    ["reward.mode: model · reward.model · sandbox_fusion", "parsed, unused", "only validation: mode model requires model.enable_resource_pool"],
    ["TrajectoryData.extra_info · score_trajectory", "extension point", "no built-in verifier uses them"],
  ], { size: 14, cellBg: (ri, ci) => (ci === 1 && ri > 0 ? (ri <= 2 ? C.bGreen : ri <= 5 ? C.bRed : C.bYellow) : "#ffffff") });
  els.push(...T.els);

  els.push(h2(0, 1060, "Built today vs designed next  (docs/ARCHITECTURE.md §7.1, IMPLEMENTATION_PLAN.md)"));
  els.push(rect(0, 1120, 940, 560, { bg: C.lGreen, stroke: C.green, sw: 1.5, dash: "dashed", rough: 0.4 }));
  els.push(text(20, 1130, "today", { size: 18, bold: true, color: C.green }));
  const rw = box(40, 1190, 380, 90, "RolloutWorker (Ray actor)", "gray");
  const lp = box(40, 1340, 380, 110, "RewardLoopWorker\nthreads inside the same process", "driver");
  const vv = box(480, 1340, 400, 110, "rule-based verifiers\n(CPU)", "rollout");
  els.push(rw, lp, vv, arrow(rw, lp, "driver"), arrow(lp, vv, "rollout"));
  els.push(rect(1020, 1120, 940, 560, { bg: C.lGray, stroke: C.gray, sw: 1.5, dash: "dashed", rough: 0.4 }));
  els.push(text(1040, 1130, "designed (scaffolding)", { size: 18, bold: true, color: C.dim }));
  const mg = box(1060, 1190, 400, 100, "RewardLoopManager\n(one Ray actor)", "gray");
  const ws = box(1060, 1360, 400, 100, "N RewardLoopWorker Ray actors\nround-robin node placement", "gray");
  const sb = box(1520, 1190, 400, 100, "SandboxFusion service\ncode_exec (security review first)", "gray");
  const rmb = box(1520, 1360, 400, 100, "generative reward model\nown GPU pool (required)", "gray");
  els.push(mg, ws, sb, rmb, arrow(mg, ws), arrow(ws, sb, "gray", { dash: "dashed" }), arrow(ws, rmb, "gray", { dash: "dashed" }));
  els.push(note(1060, 1500, 880, "Two dispatch policies: streaming random.choice per trajectory, or colocated chunk → scatter → gather (verl reward_loop.py 342-360). Rule-based verifiers need no resource pool; a reward model must have its own (enable_resource_pool, copied from verl). Plan order: exact-match and math first, code-exec in a security-reviewed workstream, reward model optional.", { size: 14, color: C.dim }));
  els.push(files(0, 1720, 1400, "src/reward/{RewardLoopManager,RewardDispatchPolicy}.cpp · src/reward/verifiers/{CodeExecVerifier,SandboxFusionClient}.cpp · docs/ARCHITECTURE.md · docs/IMPLEMENTATION_PLAN.md"));
  return els;
}

// ======================================================================
// 12 · Dependencies & build
// ======================================================================
function depsPage() {
  const els = header(12, "Dependencies & build", "What each verifier needs to compile, run and get its data — and where the Makefile puts it");
  els.push(plain(0, 200, 900, "gsm8k and exact_match need only the C++ standard library. math needs the SymEngine algebra library. IFEval carries about 2 MB of generated data tables. All of them are compiled into the Ray worker library that the rollout actors load."));
  // dependency graph
  const vrf = [
    ["gsm8k", 0, "rollout"], ["exact_match", 1, "rollout"], ["short_response", 2, "rollout"], ["math", 3, "reward"], ["ifeval / ifeval_all", 4, "trainer"], ["code_exec (stub)", 5, "gray"],
  ];
  const deps = {
    regex: box(1000, 420, 260, 64, "<regex>", "data", { font: FONT.code, size: 15 }),
    sstream: box(1000, 500, 260, 64, "<sstream> <cctype>", "data", { font: FONT.code, size: 15 }),
    sym: box(1000, 600, 260, 80, "SymEngine + GMP\n(~/.local/symengine)", "reward", { size: 15 }),
    json: box(1000, 720, 260, 64, "MiniJson", "data", { font: FONT.code, size: 15 }),
    nltk: box(1320, 700, 300, 80, "NltkTokenize\n+ PunktEnglishData.inc", "trainer", { size: 14 }),
    lang: box(1320, 800, 300, 80, "Langdetect\n+ LangdetectData.inc", "trainer", { size: 14 }),
    pystr: box(1320, 900, 300, 80, "PyStr.h\n+ PyStrTables.inc", "trainer", { size: 14 }),
    cfg: box(1000, 960, 260, 64, "SandboxFusionConfig", "gray", { font: FONT.code, size: 14 }),
  };
  els.push(...Object.values(deps));
  const vb = vrf.map(([n, i, k]) => box(0, 420 + i * 110, 320, 80, n, k, { size: 16, link: LINK.page([5, 6, 6, 7, 8, 11][i]) }));
  els.push(...vb);
  const edge = (v, d) => els.push(connect(vb[v], deps[d], { stroke: C.gray, sw: 1.3, end: "triangle", rough: 0.4 }));
  edge(0, "regex"); edge(1, "sstream"); edge(3, "sym"); edge(3, "regex"); edge(4, "json"); edge(4, "nltk"); edge(4, "lang"); edge(4, "pystr"); edge(5, "cfg");
  els.push(connect(deps.nltk, deps.pystr, { stroke: C.gray, sw: 1, end: "triangle", dash: "dashed", rough: 0.4, bend: 60 }));
  els.push(label(0, 1090, "short_response depends on nothing; IFEval uses no regex library — every pattern is a hand-written scanner."));

  els.push(h2(1680, 420, "Offline data"));
  els.push(card(1680, 480, 280, "gsm8k.py · gsm8k_chat.py\n→ answer \"72\"", "data", { size: 14 }));
  els.push(card(1680, 600, 280, "dolci_think_rl.py\n→ IFEval JSON gt, math rows (data_source \"math\")", "data", { size: 14 }));
  els.push(card(1680, 760, 280, "jsonl_to_bin.py\n→ .rlbin (optional)", "data", { size: 14 }));

  els.push(h2(0, 1160, "Where the Makefile puts each piece"));
  const T = table(0, 1220, [{ w: 520 }, { w: 1440 }], [
    ["target", "reward sources"],
    ["librl.a (RL_SOURCES := find …, line 215)", "everything under src/reward/, stubs included"],
    ["rollout_bridge_worker.so (ROLLOUT_BRIDGE_SO_SRCS 259-283)", "RewardLoopWorker, VerifierRegistry, ExactMatch, Gsm8k, MathEquivalence, IfEval, Langdetect, NltkTokenize, data/MiniJson — not RewardLoopManager, RewardDispatchPolicy, CodeExec, SandboxFusion"],
    ["link flags", "SYMENGINE_LIBS = -lsymengine -lgmp appended to LDLIBS (213) and the worker .so (323); CPATH / LIBRARY_PATH exported from SYMENGINE_PREFIX"],
    ["math_verifier_cli (465-473)", "MathEquivalenceVerifier + MiniJson + SymEngine only"],
    ["REAL_TESTS (485-490)", "test_reward_dispatch, test_reward_loop, test_verifiers, test_if_verifier"],
    ["NOCUDA_SOURCES (666-677)", "RewardDispatchPolicy, VerifierRegistry, ExactMatchVerifier (compile-only check)"],
  ], { size: 14 });
  els.push(...T.els);
  els.push(h2(0, 1220 + T.h + 50, "Tests  (all four pass on the current sources)"));
  const tt = [
    ["test_verifiers.cpp", 338, "gsm8k, exact_match, math — 147 score + 76 parse assertions"],
    ["test_if_verifier.cpp", 302, "128 rule checks (all 54 ids), 9 tokenizer, 6 langdetect, 11 whole-verifier, 6 BadArgs/Unknown"],
    ["test_reward_loop.cpp", 225, "10 functions: pool, inline, errors, timeout, drain, registry"],
    ["test_reward_dispatch.cpp", 27, "chunk_for_colocated: 10 rows → 3 chunks"],
  ];
  tt.forEach(([n, l, d], i) => els.push(card((i % 2) * 990, 1220 + T.h + 110 + Math.floor(i / 2) * 100, 970, `${n}  (${l} lines)\n${d}`, "trainer", { size: 14 })));
  return els;
}

// ======================================================================
// 13 · Bugs & gotchas
// ======================================================================
function bugsPage() {
  const els = header(13, "Bugs & gotchas", "Known issues found by reading and running the code, most severe first");
  els.push(plain(0, 200, 900, "Two of these can silently cost reward right now: the end-of-text token glued to every answer (B2), and prompts whose dataset has no verifier failing without a log line (B3)."));
  const bugs = [
    ["B1", "grpo_rlvr.yaml names unregistered types", "math_equivalence and code_exec parse fine but make RolloutWorker throw at construction. The registered math type is \"math\"; code-exec isn't registered.", "sync"],
    ["B2", "the decoded EOS reaches every verifier", "\"<|endoftext|>\" ends every eos-terminated response. Breaks exact_match and IFEval end/case rules (quotation, end_checker, last_word, json_format, english_capital: all 1 → 0 [RAN]), adds 13 bytes to short_response. gsm8k and math unaffected. Fix: strip special tokens in agent_loop_postprocess or clean_answer.", "sync"],
    ["B3", "unknown data_source fails silently", "verifier_for throws inside agent_loop_postprocess; run_prompt's catch settles the session as failed with no log line → failure groups, evicted and refilled.", "sync"],
    ["B4", "missing detokenizer_vocab", "every session throws (gpt2_single_validate.yaml) — also silently.", "sync"],
    ["B5", "gsm8k string-compare quirks", "\"72.\" captured with its period; flexible's lone \",\" → empty pred; \\boxed{ 72 } not matched; 1.50 ≠ 1.5; window counts bytes.", "reward"],
    ["B6", "misleading \"verifier threw\" log", "run_job logs it whenever extra_info has \"error\" — including IFEval's normal ground-truth errors.", "gray"],
    ["B7", "exact_match sets no pred", "the rollout log's pred column is always empty for it.", "gray"],
    ["B8", "IFEval zip truncation", "mismatched instruction_id / kwargs lengths drop constraints (same as Python; dolci_think_rl.py guards it).", "gray"],
    ["B9", "duplicate reward.verifiers datasets", "the last entry wins without a warning.", "gray"],
    ["B10", "non-numeric DAPO metric", "filter_groups.metric naming pred or failed_ids makes ReplayBufferAsync throw \"missing DAPO metric\".", "reward"],
    ["B11", "timeout semantics", "the deadline includes queue wait; timeout callbacks run serially; inline mode ignores timeout_s.", "gray"],
    ["B12", "settings dropped or unused", "reward.mode, reward.model, sandbox_fusion never used; RolloutWorkerActor doesn't forward them.", "gray"],
    ["B13", "stale docs", "STATUS.md calls math a placeholder and says RewardLoopWorker throws; README.md lists code-exec; an RLDriver comment mentions a removed stub; IfEvalVerifier.h mentions a parity CLI that doesn't exist.", "gray"],
    ["B14", "missing generators, stale artefacts", "no scripts for the three .inc tables; .d files for removed Gsm8kShaped / Gsm8kAnswer verifiers.", "gray"],
    ["B15", "unused extension points", "TrajectoryData.extra_info, prompt_text and score_trajectory are not used by any built-in verifier.", "gray"],
    ["B16", "open TODOs", "every rollout goes to the train partition (no val routing); partially visible groups are classified anyway.", "gray"],
  ];
  bugs.forEach(([id, t, d, k], i) => els.push(card((i % 2) * 990, 420 + Math.floor(i / 2) * 150, 970, `${id} · ${t}\n${d}`, k, { size: 14 })));
  els.push(h2(0, 1660, "B2, measured: IFEval rules with and without the decoded EOS  [RAN]"));
  const rules = ["startend:quotation", "last_word:last_word_answer", "change_case:english_capital", "detectable_format:json_format", "startend:end_checker"];
  rules.forEach((r, i) => {
    els.push(rect(0, 1720 + i * 60, 520, 50, { text: r, font: FONT.code, size: 14, bg: "#ffffff", stroke: C.gray, sw: 1, rough: 0, round: false }));
    els.push(rect(530, 1720 + i * 60, 220, 50, { text: "clean: 1", font: FONT.code, size: 14, bg: C.bGreen, stroke: C.gray, sw: 1, rough: 0, round: false }));
    els.push(rect(760, 1720 + i * 60, 300, 50, { text: "+ <|endoftext|>: 0", font: FONT.code, size: 14, bg: C.bRed, stroke: C.gray, sw: 1, rough: 0, round: false }));
  });
  return els;
}

write([overview, archPage, e2ePage, loopPage, configPage, gsm8kPage, smallPage, mathPage, ifevalPage, rulesPage, portsPage, scaffoldPage, depsPage, bugsPage], process.argv[2]);
````

---

## 12. A prompt you can give another agent

> Build a sketchboard drawing that explains `<subject>` in depth. Follow the guide "Generating hand-drawn
> diagrams for sketchboard from code": first research `<paths>` and verify claims by reading and, where
> possible, running the code; then write a generator `gen-<name>.cjs` using `lib.cjs` and `kit.cjs`, with an
> overview page (architecture diagram + linked page index) and one page per component, plus end-to-end flow,
> config/dependencies and caveats pages. Use visualizations wherever they explain better than text (flowcharts,
> sequence diagrams, swimlanes, tables with coloured results, charts). Generate, import into the sketchboard
> at `<url>`, run the layout check, fix every overlap, and confirm the output is reproducible.

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

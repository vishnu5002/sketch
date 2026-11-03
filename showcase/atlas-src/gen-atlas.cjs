// Builds a sketchboard reading map from atlas.json (extracted from the LLM Paper Atlas artifact).
const fs = require("fs");
const path = require("path");
const L = require("./lib.cjs");
const { C, FONT, text, rect, ellipse, note, sticky, connect, frame, group } = L;

const atlas = JSON.parse(fs.readFileSync(path.join(__dirname, "atlas.json"), "utf8"));
// Arrows mean "read in this order", so each series runs oldest first; undated links go last.
let reordered = 0;
for (const t of atlas.tiers)
  for (const s of t.series) {
    const before = s.papers.map((p) => p.id).join();
    s.papers = s.papers.map((p, i) => ({ p, i })).sort((a, b) => (a.p.date ?? "9999").localeCompare(b.p.date ?? "9999") || a.i - b.i).map((x) => x.p);
    if (s.papers.map((p) => p.id).join() !== before) reordered++;
  }

const TIER = {
  t1: { color: C.green, bg: C.bGreen, light: C.lGreen, label: "Tier 1" },
  t2: { color: C.blue, bg: C.bBlue, light: C.lBlue, label: "Tier 2" },
  t3: { color: C.violet, bg: C.bViolet, light: C.lViolet, label: "Tier 3" },
  t4: { color: C.orange, bg: C.bOrange, light: C.lOrange, label: "Tier 4" },
};

// Which page each series lives on (page index → series names), chosen to keep pages a readable size.
const PAGES = [
  { name: "1 · Fully open pipelines", tier: "t1", series: null },
  { name: "2 · DeepSeek", tier: "t2", series: ["DeepSeek"] },
  { name: "3 · Qwen, Kimi, MiniMax, GLM", tier: "t2", series: ["Qwen", "Kimi", "MiniMax", "GLM"] },
  { name: "4 · Seed, Llama, Gemma, Mistral, Phi, Nemotron", tier: "t2", series: ["ByteDance Seed", "Meta · Llama", "Google · Gemma", "Mistral", "Microsoft · Phi", "NVIDIA · Nemotron"] },
  { name: "5 · RL, RLVR & reasoning", tier: "t3", series: null },
  { name: "6 · Foundations", tier: "t4", series: null },
];

const tierById = Object.fromEntries(atlas.tiers.map((t) => [t.id, t]));
const pageOfSeries = {};
PAGES.forEach((p, i) => {
  const list = p.series ?? tierById[p.tier].series.map((s) => s.name);
  for (const s of list) pageOfSeries[s] = i + 1;
});

// ---------- links within the drawing ----------
// sketchboard follows sketchboard:page/<pageId> and sketchboard:el/<pageId>/<elementId>
// links (jump there, Alt+← back). Targets only exist once every page is built, so
// pages register what can be linked to and queue `fixups` that set the links at the end.

const pageId = (i) => `atlas-${i}`;
const LINK = {
  page: (i) => `sketchboard:page/${pageId(i)}`,
  el: (i, id) => `sketchboard:el/${pageId(i)}/${id}`,
};
const reg = {
  cardByShort: new Map(), // paper short name → { page, id }
  cardByUrl: new Map(), // paper url → { page, id }
  frame: new Map(), // series name → { page, id }
  mapRow: new Map(), // series name → Map-page row id
  resource: new Map(), // resource url → { page, id }
};
const fixups = [];

// Names in descriptions that refer to a paper card (phrase → the card's short name).
const MENTIONS = {
  "Tülu 3": "Tülu 3",
  verl: "HybridFlow (verl)",
  "Llama 3": "The Llama 3 Herd of Models",
  Magistral: "Magistral",
  CISPO: "MiniMax-M1",
  Muon: "Muon is Scalable (Moonlight)",
  DeepSeekMath: "DeepSeekMath",
  "DeepSeek-R1": "DeepSeek-R1",
  "DeepSeek-V4": "DeepSeek-V4",
  "Llama 4": "Llama 4 (blog)",
  SmolLM3: "SmolLM3 (blog)",
};

/** Link the first mention of each known paper in `el.text` to its card (skips the card's own page header). */
function linkMentions(el) {
  fixups.push(() => {
    const links = [...(el.textLinks ?? [])];
    for (const [phrase, short] of Object.entries(MENTIONS)) {
      const m = new RegExp(`(?<![\\w-])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).exec(el.text);
      const card = reg.cardByShort.get(short);
      if (!m || !card) continue;
      if (links.some((l) => l.start < m.index + phrase.length && l.end > m.index)) continue;
      links.push({ start: m.index, end: m.index + phrase.length, url: LINK.el(card.page, card.id) });
    }
    links.sort((a, b) => a.start - b.start);
    el.textLinks = links;
  });
  return el;
}

/** "⌂ Map · ← previous · next →" buttons above a page's title. */
function navRow(pi, names) {
  const items = [];
  if (pi > 0) items.push({ label: "⌂ Map", link: LINK.page(0) });
  if (pi > 1) items.push({ label: `← ${names[pi - 1]}`, link: LINK.page(pi - 1) });
  if (pi < names.length - 1) items.push({ label: `${names[pi + 1]} →`, link: LINK.page(pi + 1) });
  let x = 0;
  return items.map((it) => {
    const w = Math.round(L.textWidth(it.label, 15, FONT.body) + 40);
    const r = rect(x, -72, w, 40, { text: it.label, link: it.link, font: FONT.body, size: 15, bg: C.lGray, stroke: C.gray, sw: 1, rough: 0, color: C.dim, locked: true });
    x += w + 12;
    return r;
  });
}

const PAGE_NAMES = ["0 · Map", ...PAGES.map((p) => p.name), "7 · Courses, blogs & code"];

const plural = (n, w) => `${n} ${w}${n === 1 || w.endsWith("s") ? "" : "s"}`;
const years = (papers) => {
  const ys = papers.map((p) => p.date?.slice(0, 4)).filter(Boolean);
  return ys.length ? (ys[0] === ys.at(-1) ? ys[0] : `${ys[0]}–${ys.at(-1)}`) : "";
};

// ---------- a series: frame + paper cards in reading order (snaking rows) ----------

const CARD_W = 260;
const GAP_X = 64;
const GAP_Y = 70;
const COLS = 5;
const NOTES_W = 320;

function cardFor(p, x, y, h, tier, pi) {
  const t = TIER[tier];
  const card = rect(x, y, CARD_W, h, {
    text: p.short,
    // The underlined name is the link (Ctrl+click, or plain click in view mode).
    links: [[p.short, p.url]],
    font: FONT.body,
    size: 17,
    bold: true,
    align: "left",
    valign: "top",
    pad: 14,
    color: C.ink,
    bg: p.star ? C.lYellow : "#ffffff",
    stroke: p.star ? C.orange : t.color,
    sw: p.star ? 3 : 1.5,
    rough: 0.8,
  });
  const titleLines = L.textWidth(p.short, 17, FONT.body) > CARD_W - 28 ? 2 : 1;
  const metaY = y + 14 + titleLines * 21 + 6;
  const meta = [p.dateLabel ?? "No date", p.id === "web" ? "web page" : `arXiv ${p.id}`].join(" · ");
  const detail = [meta, ...p.badges.map((b) => `• ${b}`), p.full && p.full !== p.short ? p.full : ""].filter(Boolean).join("\n");
  const info = note(x + 4, metaY, CARD_W - 8, detail, { size: 13, color: C.dim, pad: 10 });
  const els = [card, info];
  if (p.star) els.push(rect(x + CARD_W - 132, y - 34, 124, 28, { text: "★ Start here", size: 13, font: FONT.body, bold: true, bg: C.bYellow, stroke: C.orange, sw: 1, rough: 0, color: C.ink }));
  group(els);
  if (reg.cardByShort.has(p.short)) throw new Error(`two papers named ${p.short}`);
  reg.cardByShort.set(p.short, { page: pi, id: card.id });
  if (!reg.cardByUrl.has(p.url)) reg.cardByUrl.set(p.url, { page: pi, id: card.id });
  return { card, els };
}

/** Estimated card height so every card in a row lines up. */
function cardHeight(p) {
  const titleLines = L.textWidth(p.short, 17, FONT.body) > CARD_W - 28 ? 2 : 1;
  const fullLines = p.full && p.full !== p.short ? Math.ceil((p.full.length * 13 * 0.5) / (CARD_W - 28)) : 0;
  const infoLines = 1 + p.badges.length + fullLines;
  return 14 + titleLines * 21 + 6 + infoLines * 16.5 + 26;
}

function seriesBlock(s, tier, x0, y0, pi) {
  const t = TIER[tier];
  const els = [];
  const n = s.papers.length;
  const cols = Math.min(COLS, n);
  const rows = Math.ceil(n / COLS);
  const gridW = cols * CARD_W + (cols - 1) * GAP_X;
  const innerX = x0 + 36;
  const headH = 140;
  const rowHeights = [];
  for (let r = 0; r < rows; r++) rowHeights.push(Math.max(...s.papers.slice(r * COLS, r * COLS + COLS).map(cardHeight)));
  const gridH = rowHeights.reduce((a, b) => a + b, 0) + (rows - 1) * GAP_Y;
  const notesX = innerX + Math.max(gridW, 3 * CARD_W + 2 * GAP_X) + 56;
  const width = notesX + NOTES_W + 36 - x0;
  const notesH = Math.max(260, Math.min(gridH, 520));
  const height = headH + Math.max(gridH, notesH) + 60;

  const fr = frame(x0, y0, width, height, `${s.name} · ${plural(n, "paper")}${years(s.papers) ? ` · ${years(s.papers)}` : ""}`);
  reg.frame.set(s.name, { page: pi, id: fr.id });
  els.push(fr);
  // The series name leads back to its row on the Map.
  const title = text(innerX, y0 + 26, s.name, { font: FONT.display, size: 34, color: C.ink });
  fixups.push(() => (title.link = LINK.el(0, reg.mapRow.get(s.name))));
  els.push(title);
  els.push(linkMentions(text(innerX, y0 + 72, [s.org, s.why].filter(Boolean).join("  —  "), { size: 18, color: C.dim })));

  const cards = [];
  s.papers.forEach((p, i) => {
    const r = Math.floor(i / COLS);
    const c = i % COLS;
    // Snake: even rows run left→right, odd rows right→left, so each arrow stays short.
    const col = r % 2 === 0 ? c : cols - 1 - c;
    const ry = y0 + headH + rowHeights.slice(0, r).reduce((a, b) => a + b, 0) + r * GAP_Y;
    const { card, els: ce } = cardFor(p, innerX + col * (CARD_W + GAP_X), ry, rowHeights[r], tier, pi);
    cards.push(card);
    els.push(...ce);
  });
  for (let i = 0; i < cards.length - 1; i++) {
    els.push(connect(cards[i], cards[i + 1], { stroke: t.color, sw: 2, end: "triangle", rough: 0.6 }));
  }

  els.push(
    sticky(notesX, y0 + headH, NOTES_W, `My notes — ${s.name}\n\nKey ideas:\n\n\nQuestions:\n\n\nTo try:\n`, {
      bg: C.bYellow,
      size: 17,
      font: FONT.hand,
      h: notesH,
    }),
  );
  return { els, width, height, starts: s.papers.filter((p) => p.star).length };
}

function seriesPage({ name, tier, series }, pi) {
  const t = TIER[tier];
  const tierData = tierById[tier];
  const list = (series ?? tierData.series.map((s) => s.name)).map((n) => tierData.series.find((s) => s.name === n));
  const els = [];
  const total = list.reduce((a, s) => a + s.papers.length, 0);
  els.push(text(0, 0, name.replace(/^\d+ · /, ""), { font: FONT.display, size: 60, locked: true }));
  els.push(Object.assign(L.scribble(L.wavePts(2, 84, 760, 3), { stroke: t.color, sw: 4 }), { locked: true }));
  els.push(...navRow(pi, PAGE_NAMES));
  els.push(linkMentions(text(0, 104, `${t.label} · ${tierData.name} — ${tierData.blurb}`, { size: 22, color: C.dim, locked: true })));
  els.push(
    text(0, 140, `${plural(list.length, "series")} · ${plural(total, "paper")} on this page · arrows show reading order (oldest first) · ★ = good first paper`, {
      size: 17,
      color: C.gray,
      italic: true,
      locked: true,
    }),
  );
  let y = 230;
  for (const s of list) {
    const b = seriesBlock(s, tier, 0, y, pi);
    els.push(...b.els);
    y += b.height + 110;
  }
  return { name, els };
}

// ---------- page 0: the map ----------

function mapPage() {
  const els = [];
  const totals = { entries: 0, series: 0, stars: 0 };
  for (const t of atlas.tiers)
    for (const s of t.series) {
      totals.series++;
      totals.entries += s.papers.length;
      totals.stars += s.papers.filter((p) => p.star).length;
    }
  els.push(...navRow(0, PAGE_NAMES));
  els.push(text(0, 0, "LLM Paper Atlas — reading map", { font: FONT.display, size: 72, locked: true }));
  els.push(Object.assign(L.scribble(L.wavePts(4, 96, 1040, 4), { stroke: C.blue, sw: 5 }), { locked: true }));
  els.push(
    text(0, 118, `${totals.entries} entries · ${totals.series} series · 4 tiers · ${totals.stars} starting points ★ — from fully open pipelines down to the foundations they build on`, {
      size: 22,
      color: C.dim,
      locked: true,
    }),
  );

  // Mind map: atlas → tiers → series (left to right).
  const top = 260;
  const seriesRows = atlas.tiers.flatMap((t) => t.series.map((s) => ({ t, s })));
  const rowH = 74;
  const mapH = seriesRows.length * rowH;
  const root = ellipse(0, top + mapH / 2 - 90, 300, 180, { text: "LLM Paper\nAtlas", font: FONT.display, size: 34, bg: C.bYellow, stroke: C.orange, sw: 3, rough: 1.2 });
  els.push(root);
  let row = 0;
  for (const t of atlas.tiers) {
    const tc = TIER[t.id];
    const count = t.series.reduce((a, s) => a + s.papers.length, 0);
    const firstY = top + row * rowH;
    const lastY = top + (row + t.series.length - 1) * rowH;
    const tierNode = rect(440, (firstY + lastY) / 2 - 10, 330, 92, {
      // a tier leads to its first page
      link: LINK.page(PAGES.findIndex((p) => p.tier === t.id) + 1),
      text: `${tc.label}: ${t.name}\n${plural(count, "paper")}`,
      font: FONT.body,
      bold: true,
      size: 18,
      bg: tc.bg,
      stroke: tc.color,
      sw: 2.5,
      color: C.ink,
    });
    els.push(tierNode, connect(root, tierNode, { stroke: tc.color, sw: 2.5, end: "none" }));
    for (const s of t.series) {
      const y = top + row * rowH;
      const stars = s.papers.filter((p) => p.star).length;
      const node = rect(900, y, 470, 60, {
        text: `${s.name}  ·  ${s.papers.length}${stars ? `  ·  ${stars}★` : ""}  →  page ${pageOfSeries[s.name]}`,
        font: FONT.body,
        size: 16,
        align: "left",
        bg: tc.light,
        stroke: tc.color,
        sw: 1.5,
        rough: 0.6,
        color: C.ink,
      });
      // the row leads to its series' frame
      reg.mapRow.set(s.name, node.id);
      fixups.push(() => (node.link = LINK.el(pageOfSeries[s.name], reg.frame.get(s.name).id)));
      els.push(node, connect(tierNode, node, { stroke: tc.color, sw: 1.5, bend: (y - (firstY + lastY) / 2) * 0.12, end: "none" }));
      row++;
    }
  }

  // Suggested path for RL work.
  const px = 1560;
  const path = atlas.extras.find((g) => /order/i.test(g.name));
  els.push(text(px, top - 70, "Suggested order for RL work", { font: FONT.hand, size: 34 }));
  els.push(text(px, top - 28, "Follow the arrows · a step jumps to its paper card (Alt+← comes back)", { size: 16, color: C.gray, italic: true }));
  const steps = path.items.map((it, i) =>
    rect(px + (i % 2) * 40, top + 10 + i * 128, 400, 82, {
      text: `${i + 1}. ${it.title}`,
      links: [[it.title, it.url]],
      font: FONT.body,
      bold: true,
      size: 19,
      bg: i < 3 ? C.bViolet : C.lViolet,
      stroke: C.violet,
      sw: 2,
      color: C.ink,
    }),
  );
  els.push(...steps);
  // Each step's name leads to its paper card (or, for code, its resource), which links on to arXiv.
  path.items.forEach((it, i) =>
    fixups.push(() => {
      const target = reg.cardByUrl.get(it.url) ?? reg.resource.get(it.url);
      if (!target) throw new Error(`no card for step ${it.title}`);
      steps[i].textLinks = steps[i].textLinks.map((l) => ({ ...l, url: LINK.el(target.page, target.id) }));
    }),
  );
  for (let i = 0; i < steps.length - 1; i++) els.push(connect(steps[i], steps[i + 1], { stroke: C.violet, sw: 2.5, end: "triangle" }));
  els.push(linkMentions(note(px + 470, top + 10, 300, "Steps 1–3 are the core: GRPO, how R1 used it, and Tülu 3's RLVR. 4–8 are the fixes and frontier recipes built on top. 9 asks what RLVR really teaches. 10 is the code to try it.", { size: 16, color: C.dim })));

  // How to use.
  const hy = top + 10 + path.items.length * 128 + 40;
  els.push(
    sticky(px, hy, 380, "How to track your reading\n\n1. Select a paper card\n2. Pick a Background colour:\n   yellow = reading\n   green = done\n3. Jot notes in each series' yellow notes sticky\n\nRows, tiers and steps jump to their page or card; Alt+← (or Back) returns. In view mode (Alt+R) a click follows a link; while editing, Ctrl+click. A paper's name opens it on arXiv. Ctrl+F finds any paper.", {
      bg: C.bYellow,
      size: 17,
      font: FONT.body,
      angle: -0.012,
    }),
  );
  const lx = px + 420;
  els.push(text(lx, hy, "Card colours", { size: 18, bold: true }));
  const legend = [
    ["To read", "#ffffff", C.blue],
    ["★ Start here", C.lYellow, C.orange],
    ["Reading", C.bYellow, C.yellow],
    ["Done", C.bGreen, C.green],
  ];
  legend.forEach(([label, bg, stroke], i) => {
    els.push(rect(lx, hy + 40 + i * 56, 200, 44, { text: label, bg, stroke, sw: label.startsWith("★") ? 3 : 1.5, font: FONT.body, size: 16, color: C.ink, rough: 0.6 }));
  });
  els.push(linkMentions(note(0, top + mapH + 40, 1400, atlas.note, { size: 15, color: C.gray, italic: true })));
  return { name: "0 · Map", els };
}

// ---------- resources ----------

function resourcesPage(pi) {
  const els = [...navRow(pi, PAGE_NAMES)];
  els.push(text(0, 0, "Courses, blogs & code", { font: FONT.display, size: 60, locked: true }));
  els.push(Object.assign(L.scribble(L.wavePts(2, 84, 700, 3), { stroke: C.teal, sw: 4 }), { locked: true }));
  els.push(text(0, 104, "Explanations and codebases that make the papers easier to follow", { size: 22, color: C.dim, locked: true }));
  const res = atlas.extras.find((g) => /resources/i.test(g.name));
  const kinds = [...new Set(res.items.map((i) => i.kind))];
  const palette = [C.bCyan, C.bGreen, C.bGrape, C.bOrange, C.bBlue, C.bYellow, C.bRed, C.bViolet, C.bGray];
  let y = 200;
  const colX = [0, 640, 1280];
  const colY = [y, y, y];
  kinds.forEach((k, ki) => {
    const items = res.items.filter((i) => i.kind === k);
    const c = colY.indexOf(Math.min(...colY));
    const x = colX[c];
    let cy = colY[c];
    els.push(text(x, cy, k, { font: FONT.hand, size: 30 }));
    cy += 50;
    for (const it of items) {
      const r = rect(x, cy, 580, 64, { text: it.title, links: [[it.title, it.url]], font: FONT.body, size: 18, align: "left", bg: palette[ki % palette.length], stroke: C.dim, sw: 1, rough: 0.6, color: C.ink });
      reg.resource.set(it.url, { page: pi, id: r.id });
      els.push(r);
      cy += 80;
    }
    colY[c] = cy + 40;
  });
  return { name: "7 · Courses, blogs & code", els };
}

const pages = [mapPage(), ...PAGES.map((p, i) => seriesPage(p, i + 1)), resourcesPage(PAGES.length + 1)].map((p, i) => ({
  id: pageId(i),
  name: p.name,
  elements: p.els,
}));
if (pages.map((p) => p.name).join() !== PAGE_NAMES.join()) throw new Error("PAGE_NAMES is out of date");
for (const f of fixups) f();
const doc = { type: "sketchboard", version: 2, pages, activePageId: pages[0].id, canvasBg: "#fbfcfd" };

const ids = new Set();
for (const p of pages) for (const e of p.elements) {
  if (ids.has(e.id)) throw new Error("duplicate id");
  ids.add(e.id);
}
// Every link into the drawing must land on an element of the page it names.
let internal = 0;
for (const p of pages)
  for (const e of p.elements)
    for (const url of [e.link, ...(e.textLinks ?? []).map((l) => l.url)]) {
      if (!url?.startsWith("sketchboard:")) continue;
      internal++;
      const m = /^sketchboard:(?:page\/([\w-]+)|el\/([\w-]+)\/([\w-]+))$/.exec(url);
      const pg = m && pages.find((q) => q.id === (m[1] ?? m[2]));
      if (!pg || (m[3] && !pg.elements.some((x) => x.id === m[3]))) throw new Error(`broken link ${url} on ${p.name}`);
    }
const paperCards = pages.slice(1, -1).flatMap((p) => p.elements).filter((e) => e.type === "rectangle" && e.fontSize === 17 && e.textLinks?.length);
console.log(pages.map((p) => `${p.name}: ${p.elements.length} elements`).join("\n"));
console.log("paper cards:", paperCards.length, "· series re-sorted by date:", reordered, "· links within the drawing:", internal);
fs.writeFileSync(process.argv[2], JSON.stringify(doc));
console.log("bytes", fs.statSync(process.argv[2]).size);

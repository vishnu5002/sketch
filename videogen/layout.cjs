// timeline.json + words.json -> video.json (what the player renders) and video.sketchboard.json (the same
// scenes as an editable drawing, one page per scene).
//
//   node videogen/layout.cjs videogen/out/rat-race
//
// Every element gets `anim: {t, d}`: the second it starts drawing and how long the drawing takes.
const fs = require("fs");
const path = require("path");
const L = require("../showcase/atlas-src/lib.cjs");
const { C, FONT, text, rect, ellipse, connect, frame } = L;

const W = 1080;
const H = 1920;
const M = 70; // side margin
const CONTENT_BOTTOM = 1480; // below this the captions live
const GAP = 64; // between blocks

const COLOR = {
  blue: { s: C.blue, b: C.bBlue }, green: { s: C.green, b: C.bGreen }, red: { s: C.red, b: C.bRed },
  orange: { s: C.orange, b: C.bOrange }, violet: { s: C.violet, b: C.bViolet }, gray: { s: C.dim, b: C.bGray },
};
const col = (c) => COLOR[c] ?? COLOR.blue;
const anim = (el, t, d) => Object.assign(el, { anim: { t: +t.toFixed(3), d } });
const lineH = (size) => size * 1.25;

/** Largest size <= `size` at which the longest word of `str` fits in `w` (never break a word). */
const fitWord = (str, w, size, font) => Math.min(size, Math.floor(w / Math.max(...str.split(/\s+/).map((x) => L.textWidth(x, 1, font)))));

/** A lucide icon (from sketchboard's own copy of lucide-react) as an SVG data URL for an image element. */
function iconSrc(name, color) {
  const file = path.join(__dirname, "../sketchboard/node_modules/lucide-react/dist/esm/icons", `${name}.mjs`);
  const src = fs.readFileSync(file, "utf8");
  // The file holds `node: [["path", { d: "…", key: "…" }], …]`: a JS literal of the icon's SVG children.
  const node = Function(`return ${src.slice(src.indexOf("node: ") + 6, src.indexOf("\n  ]") + 4)}`)();
  const body = node.map(([tag, a]) => `<${tag} ${Object.entries(a).filter(([k]) => k !== "key").map(([k, v]) => `${k}="${v}"`).join(" ")}/>`).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

/** When each item of a list / cycle / steps is written: as it is said, otherwise one after another,
 *  squeezed so the last one is written before the scene ends. */
function itemTimes(v, end) {
  const step = Math.max(0.25, Math.min(0.7, (end - 1 - v.t) / v.items.length));
  const out = [];
  v.items.forEach((_, i) => out.push(Math.max(v.item_t?.[i] ?? (i ? out[i - 1] + step : v.t), i ? out[i - 1] + 0.25 : v.t)));
  return out;
}

/** Height of a hand-written label wrapped at `w`. */
const textH = (str, w, size, font) => L.wrapLines(str, w, size, font) * lineH(size);

// ---------- blocks: each returns {h, build(y) -> elements} so a scene can be measured before placing ----------

function titleBlock(str, t, s) {
  const size = Math.round(92 * s);
  const h = textH(str, W - 2 * M, size, FONT.display) + 30;
  return {
    h,
    build(y) {
      const title = anim(rect(M, y, W - 2 * M, h - 30, { text: str, font: FONT.display, size, stroke: "transparent", rough: 0, color: C.ink }), t, 0.7);
      const tw = Math.min(W - 2 * M, L.textWidth(str, size, FONT.display) + 40);
      const line = anim(Object.assign(L.scribble(L.wavePts((W - tw) / 2, y + h - 12, tw, 4)), { strokeColor: C.orange, strokeWidth: 5 }), t + 0.5, 0.5);
      return [title, line];
    },
  };
}

/** All of a scene's boxes and the arrows between them, as one diagram. */
function diagramBlock(boxes, arrows, highlights, s) {
  const size = Math.round(64 * s);
  const across = boxes.length === 2; // two boxes sit side by side, others stack
  const bw = across ? 430 : 680;
  const sizes = boxes.map((b) => fitWord(b.text, bw - 60, size, FONT.hand));
  const hs = boxes.map((b, i) => Math.max(210 * s, textH(b.text, bw - 40, sizes[i], FONT.hand) + 50));
  const gap = across ? 0 : 170 * s;
  const h = across ? Math.max(...hs) : hs.reduce((a, b) => a + b, 0) + gap * (boxes.length - 1);
  return {
    h,
    build(y) {
      const els = [];
      const byId = {};
      let cy = y;
      boxes.forEach((b, i) => {
        const x = across ? (i === 0 ? M : W - M - bw) : (W - bw) / 2;
        const by = across ? y + (h - hs[i]) / 2 : cy;
        const c = col(b.color);
        const el = anim(rect(x, by, bw, hs[i], { text: b.text, font: FONT.hand, size: sizes[i], bg: c.b, stroke: c.s, sw: 4, color: C.ink }), b.t, 0.9);
        byId[b.id] = el;
        els.push(el);
        cy += hs[i] + gap;
      });
      for (const a of arrows) {
        const from = byId[a.from];
        const to = byId[a.to];
        const adjacent = Math.abs(boxes.findIndex((b) => b.id === a.from) - boxes.findIndex((b) => b.id === a.to)) === 1;
        // An arrow can't start before both its boxes have been drawn.
        const t = Math.max(a.t, from.anim.t + 0.8, to.anim.t + 0.8);
        const arrow = anim(connect(from, to, { stroke: C.ink, sw: 4, rough: 0.8, end: "triangle", bend: adjacent || across ? 0 : 160 }), t, 0.6);
        els.push(arrow);
        if (a.text && a.text !== "→") {
          const mx = (L.center(from).x + L.center(to).x) / 2;
          const my = (L.center(from).y + L.center(to).y) / 2;
          const label = across
            ? text(mx, my - 150 * s, a.text, { size: Math.round(44 * s), align: "center", color: C.dim, italic: true })
            : text(mx + 40, my - 22, a.text, { size: Math.round(44 * s), color: C.dim, italic: true });
          els.push(anim(label, t + 0.5, 0.5));
        }
      }
      // A hand-drawn ring around the box the narrator stresses.
      for (const hl of highlights) {
        const b = byId[hl.target];
        if (!b) continue;
        const ring = ellipse(b.x - 40, b.y - 40, b.width + 80, b.height + 80, { stroke: C.red, bg: "transparent", sw: 5, rough: 2 });
        els.push(anim(ring, Math.max(hl.t, b.anim.t + 0.9), 0.7));
      }
      return els;
    },
  };
}

function listBlock(v, s, end) {
  const size = Math.round(64 * s);
  const rows = v.items.map((it) => textH(it, W - 2 * M - 80, size, FONT.body) + 36 * s);
  return {
    h: rows.reduce((a, b) => a + b, 0),
    build(y) {
      const els = [];
      let cy = y;
      const times = itemTimes(v, end);
      v.items.forEach((it, i) => {
        const t = times[i];
        const c = col(["blue", "green", "orange", "violet"][i % 4]);
        els.push(anim(ellipse(M + 10, cy + lineH(size) / 2 - 18, 36, 36, { bg: c.s, stroke: c.s, sw: 2 }), t, 0.25));
        els.push(anim(L.note(M + 60, cy - 10, W - 2 * M - 60, it, { size, font: FONT.body, pad: 10 }), t + 0.15, 0.5));
        cy += rows[i];
      });
      return els;
    },
  };
}

function statBlock(v, s) {
  const big = Math.round(200 * s);
  const size = Math.round(58 * s);
  const ch = textH(v.text, W - 2 * M, size, FONT.body);
  return {
    h: lineH(big) + ch + 10,
    build(y) {
      const c = col(v.color ?? "orange");
      return [
        anim(text(W / 2, y, v.value, { font: FONT.display, size: big, align: "center", color: c.s }), v.t, 0.5),
        anim(rect(M, y + lineH(big) + 10, W - 2 * M, ch, { text: v.text, font: FONT.body, size, stroke: "transparent", rough: 0, color: C.dim }), v.t + 0.4, 0.5),
      ];
    },
  };
}

function compareBlock(v, s) {
  const cw = 420;
  const size = Math.min(...[v.left, v.right].map((x) => fitWord(x, cw - 60, Math.round(58 * s), FONT.hand)));
  const h = Math.max(...[v.left, v.right].map((x) => textH(x, cw - 40, size, FONT.hand) + 70), 240 * s);
  return {
    h,
    build(y) {
      const rt = Math.max(v.right_t ?? v.t + 0.9, v.t + 0.9);
      return [
        anim(rect(M, y, cw, h, { text: v.left, font: FONT.hand, size, bg: C.lRed, stroke: C.red, sw: 3 }), v.t, 0.8),
        anim(text(W / 2, y + h / 2 - 34, "vs", { font: FONT.display, size: 56, align: "center", color: C.gray }), rt - 0.3, 0.3),
        anim(rect(W - M - cw, y, cw, h, { text: v.right, font: FONT.hand, size, bg: C.lGreen, stroke: C.green, sw: 3 }), rt, 0.8),
      ];
    },
  };
}

function iconBlock(v, s) {
  const size = Math.round(320 * s);
  const cap = Math.round(60 * s);
  const ch = v.text ? textH(v.text, W - 2 * M, cap, FONT.hand) : 0;
  return {
    h: size + (ch ? ch + 20 : 0),
    build(y) {
      const img = L.base("image", (W - size) / 2, y, size, size, {
        strokeWidth: 1, roughness: 0, roundness: false, src: iconSrc(v.name, C.ink), naturalWidth: 24, naturalHeight: 24,
      });
      const els = [anim(img, v.t, 0.7)];
      if (ch) els.push(anim(rect(M, y + size + 20, W - 2 * M, ch, { text: v.text, font: FONT.hand, size: cap, stroke: "transparent", rough: 0, color: C.dim }), v.t + 0.4, 0.5));
      return els;
    },
  };
}

/** 3-4 stages on a ring, each pointing to the next and the last back to the first. */
function cycleBlock(v, s, end) {
  const n = v.items.length;
  const bw = Math.round(340 * s);
  const size = Math.min(...v.items.map((it) => fitWord(it, bw - 50, Math.round(54 * s), FONT.hand)));
  const bh = Math.max(...v.items.map((it) => textH(it, bw - 40, size, FONT.hand) + 50), 140 * s);
  // Side stages sit at cx ± R, so R must leave room for half a box inside each margin.
  const R = Math.min(Math.round((n === 4 ? 330 : 300) * s), W / 2 - M - bw / 2);
  return {
    h: 2 * R + bh,
    build(y) {
      const cx = W / 2;
      const cy = y + R + bh / 2;
      const times = itemTimes(v, end);
      const palette = ["blue", "green", "orange", "violet"];
      const boxes = v.items.map((it, i) => {
        const a = -Math.PI / 2 + (2 * Math.PI * i) / n; // clockwise from the top
        const c = col(palette[i]);
        const el = rect(cx + R * Math.cos(a) - bw / 2, cy + R * Math.sin(a) - bh / 2, bw, bh, { text: it, font: FONT.hand, size, bg: c.b, stroke: c.s, sw: 4 });
        return anim(el, times[i], 0.8);
      });
      // Arrows bulge outward (negative bend, going clockwise); each one leads into the stage that comes next.
      const arrows = boxes.map((b, i) => {
        const next = boxes[(i + 1) % n];
        const t = i + 1 < n ? Math.max(next.anim.t - 0.3, b.anim.t + 0.7) : boxes[n - 1].anim.t + 0.9;
        return anim(connect(b, next, { stroke: C.ink, sw: 4, rough: 0.8, end: "triangle", bend: -Math.round(80 * s) }), t, 0.6);
      });
      return [...boxes, ...arrows];
    },
  };
}

/** 2-4 numbered stages, top to bottom, joined by arrows. */
function stepsBlock(v, s, end) {
  const size = Math.round(60 * s);
  const dot = Math.round(110 * s);
  const tw = W - 2 * M - dot - 40;
  const rows = v.items.map((it) => Math.max(dot, textH(it, tw, size, FONT.hand)));
  const gap = Math.round(70 * s);
  return {
    h: rows.reduce((a, b) => a + b, 0) + gap * (rows.length - 1),
    build(y) {
      const els = [];
      const times = itemTimes(v, end);
      const palette = ["blue", "green", "orange", "violet"];
      let cy = y;
      let prev = null;
      v.items.forEach((it, i) => {
        const c = col(palette[i]);
        const num = ellipse(M, cy + (rows[i] - dot) / 2, dot, dot, { text: String(i + 1), font: FONT.display, size: Math.round(56 * s), bg: c.b, stroke: c.s, sw: 4 });
        els.push(anim(num, times[i], 0.5));
        const label = rect(M + dot + 40, cy, tw, rows[i], { text: it, font: FONT.hand, size, align: "left", stroke: "transparent", rough: 0, color: C.ink });
        els.push(anim(label, times[i] + 0.3, 0.6));
        if (prev) els.push(anim(connect(prev, num, { stroke: C.gray, sw: 3, rough: 0.6, end: "triangle" }), times[i] - 0.2, 0.4));
        prev = num;
        cy += rows[i] + gap;
      });
      return els;
    },
  };
}

// ---------- scenes ----------

function sceneBlocks(scene, s) {
  const vs = scene.visuals;
  const title = vs.find((v) => v.kind === "title");
  const blocks = [titleBlock(title?.text ?? scene.heading, title?.t ?? scene.start, s)];
  const boxes = vs.filter((v) => v.kind === "box");
  const ids = new Set(boxes.map((b) => b.id));
  const arrows = vs.filter((v) => v.kind === "arrow" && v.from !== v.to && ids.has(v.from) && ids.has(v.to));
  const highlights = vs.filter((v) => v.kind === "highlight" && ids.has(v.target));
  let diagramPlaced = false;
  for (const v of vs) {
    if ((v.kind === "box" || v.kind === "arrow" || v.kind === "highlight") && !diagramPlaced && boxes.length) {
      blocks.push(diagramBlock(boxes, arrows, highlights, s));
      diagramPlaced = true;
    } else if (v.kind === "list") blocks.push(listBlock(v, s, scene.end));
    else if (v.kind === "icon") blocks.push(iconBlock(v, s));
    else if (v.kind === "cycle") blocks.push(cycleBlock(v, s, scene.end));
    else if (v.kind === "steps") blocks.push(stepsBlock(v, s, scene.end));
    else if (v.kind === "stat") blocks.push(statBlock(v, s));
    else if (v.kind === "compare") blocks.push(compareBlock(v, s));
  }
  return blocks;
}

function layoutScene(scene, i) {
  // Shrink everything a little at a time until the scene fits above the captions.
  let s = 1.15; // start a little large: a sparse scene fills the screen
  let blocks;
  let total;
  for (; s > 0.5; s -= 0.06) {
    blocks = sceneBlocks(scene, s);
    total = blocks.reduce((a, b) => a + b.h, 0) + GAP * (blocks.length - 1);
    if (140 + total <= CONTENT_BOTTOM) break;
  }
  const [title, ...rest] = blocks;
  const els = [frame(0, 0, W, H, scene.heading)];
  els.push(...title.build(140));
  // The rest is centred in the space between the title and the captions.
  const restH = total - title.h - GAP;
  let y = 140 + title.h + GAP + Math.max(0, (CONTENT_BOTTOM - (140 + title.h + GAP) - restH) / 2);
  for (const b of rest) {
    els.push(...b.build(y));
    y += b.h + GAP;
  }
  // Nothing may still be drawing when the scene cuts away.
  for (const e of els) if (e.anim) e.anim.t = Math.max(scene.start, Math.min(e.anim.t, scene.end - e.anim.d - 0.1));
  return { id: `v-${i}`, name: `${i + 1} · ${scene.heading}`, elements: els };
}

function main(dir) {
  const timeline = JSON.parse(fs.readFileSync(path.join(dir, "timeline.json"), "utf8"));
  const words = JSON.parse(fs.readFileSync(path.join(dir, "words.json"), "utf8"));
  const pages = timeline.scenes.map(layoutScene);
  const video = {
    width: W, height: H, fps: 30, bg: "#fbfcfd", duration: timeline.duration,
    scenes: timeline.scenes.map((s, i) => ({ start: s.start, end: s.end, elements: pages[i].elements })),
    words: words.scenes.flatMap((s) => s.words),
  };
  fs.writeFileSync(path.join(dir, "video.json"), JSON.stringify(video));
  const doc = { type: "sketchboard", version: 2, pages, activePageId: pages[0].id, canvasBg: video.bg };
  fs.writeFileSync(path.join(dir, "video.sketchboard.json"), JSON.stringify(doc));
  for (const p of pages) console.log(`${p.name}: ${p.elements.length} elements`);
}

main(process.argv[2]);

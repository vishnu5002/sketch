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

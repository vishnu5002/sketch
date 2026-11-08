// Video player: draws any instant of a narrated sketch video, for frame-by-frame capture.
//
// player.html exposes, once loaded:
//   await __load(video)   video.json from videogen/layout.cjs (scenes of elements with anim {t, d}, words)
//   __seek(t)             draw the frame at t seconds
//   __frame(t)            draw it and return it as a JPEG data URL
//
// Rendering is a pure function of t (no clocks, no requestAnimationFrame), so every capture is identical.
import "@fontsource/nunito/400.css";
import "@fontsource/nunito/800.css";
import "@fontsource/lilita-one/400.css";
import type { RoughCanvas } from "roughjs/bin/canvas";
import type { Drawable, OpSet } from "roughjs/bin/core";
import type { SketchElement } from "./types";
import { CONTAINER_PADDING, containerTextHeight, createRoughCanvas, drawElement, getDrawables, isTextContainer, measureText, preloadImage } from "./utils/renderer";
import { refreshBindings } from "./utils/binding";
import { registerBundledFonts } from "./utils/fonts";

type Anim = { t: number; d: number };
type VEl = SketchElement & { anim?: Anim };
type Word = [string, number, number];
interface Video {
  width: number;
  height: number;
  bg: string;
  duration: number;
  scenes: { start: number; end: number; elements: VEl[] }[];
  words: Word[];
}
interface Chunk {
  words: Word[];
  start: number;
  end: number;
}

const FADE = 0.35; // scene transition
const CAPTION_Y = 1640;
const CAPTION_FONT = (size: number) => `800 ${size}px Nunito, sans-serif`;

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
const rc: RoughCanvas = createRoughCanvas(canvas);
let video: Video | null = null;
let chunks: Chunk[] = [];

const clamp = (v: number) => Math.max(0, Math.min(1, v));
const ease = (v: number) => 1 - (1 - v) * (1 - v);

/** The app's own fix-ups on load: text measured with real fonts, arrows snapped to their boxes. */
function refitAll(els: VEl[]): VEl[] {
  const sized = els.map((el) => {
    if (el.type === "text") {
      const m = measureText(el.text || " ", el);
      // Centred labels were placed from an estimated width: keep their centre where the layout put it.
      const x = el.textAlign === "center" ? el.x + (el.width - m.width) / 2 : el.x;
      return { ...el, x, width: m.width, height: m.height };
    }
    if (isTextContainer(el) && el.text) {
      const need = containerTextHeight(el) + CONTAINER_PADDING * 2;
      if (need > el.height) return { ...el, height: need };
    }
    return el;
  });
  return refreshBindings(sized) as VEl[];
}

/** Caption chunks: a few words at a time, breaking at punctuation and pauses. */
function chunkWords(words: Word[]): Chunk[] {
  const out: Chunk[] = [];
  let cur: Word[] = [];
  const flush = () => {
    if (cur.length) out.push({ words: cur, start: cur[0][1], end: cur[cur.length - 1][2] });
    cur = [];
  };
  words.forEach((w, i) => {
    const prev = cur[cur.length - 1];
    if (prev && (cur.length >= 4 || /[.,!?;:—]$/.test(prev[0]) || w[1] - prev[2] > 0.3)) flush();
    cur.push(w);
    if (i === words.length - 1) flush();
  });
  return out;
}

// Text is revealed through a ghost copy of its element with an invisible outline.
const ghosts = new WeakMap<VEl, VEl>();
function ghostOf(el: VEl): VEl {
  let g = ghosts.get(el);
  if (!g) {
    g = { ...el, strokeColor: "transparent", backgroundColor: "transparent", textColor: el.textColor ?? el.strokeColor };
    ghosts.set(el, g);
  }
  return g;
}

/** Draw the leading fraction `p` of a rough.js shape: outlines grow stroke by stroke, fills fade in. */
function drawStrokes(el: VEl, p: number) {
  const drawables = getDrawables(el);
  const total = drawables.reduce((n, d) => n + d.sets.reduce((m, s) => m + (s.type === "path" ? s.ops.length : 0), 0), 0);
  let budget = Math.ceil(total * p);
  ctx.save();
  ctx.translate(el.x, el.y);
  for (const d of drawables) {
    const fills = d.sets.filter((s) => s.type !== "path");
    if (fills.length && p > 0) {
      ctx.save();
      ctx.globalAlpha = (el.opacity / 100) * p;
      rc.draw({ ...d, sets: fills } as Drawable);
      ctx.restore();
    }
    const paths: OpSet[] = [];
    for (const s of d.sets) {
      if (s.type !== "path" || budget <= 1) continue;
      const take = Math.min(budget, s.ops.length);
      paths.push({ ...s, ops: s.ops.slice(0, take) });
      budget -= take;
    }
    if (paths.length) {
      ctx.globalAlpha = el.opacity / 100;
      rc.draw({ ...d, sets: paths } as Drawable);
    }
  }
  ctx.restore();
}

/** Reveal an element's text (or freehand stroke) left to right, like a pen writing it. */
function wipe(el: VEl, p: number, draw: () => void) {
  if (p <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(el.x - 20, el.y - 20, (el.width + 40) * p, el.height + 40);
  ctx.clip();
  draw();
  ctx.restore();
}

function drawAt(el: VEl, t: number) {
  if (el.type === "frame") return;
  const p = el.anim ? clamp((t - el.anim.t) / el.anim.d) : 1;
  if (p <= 0) return;
  if (p >= 1) return drawElement(ctx, el, rc);
  if (el.type === "text" || el.type === "draw" || el.type === "image") return wipe(el, ease(p), () => drawElement(ctx, el, rc));
  // Shapes and arrows: the outline takes the first 60%, then any text inside is written.
  drawStrokes(el, ease(clamp(p / 0.6)));
  if (el.text) wipe(el, clamp((p - 0.45) / 0.55), () => drawElement(ctx, ghostOf(el), rc));
}

function drawCaption(t: number) {
  const c = chunks.find((k) => t >= k.start - 0.05 && t <= k.end + 0.25);
  if (!c || !video) return;
  let size = 64;
  const gap = () => size * 0.3;
  const widths = () => c.words.map(([w]) => (ctx.font = CAPTION_FONT(size), ctx.measureText(w).width));
  let ws = widths();
  while (ws.reduce((a, b) => a + b, 0) + gap() * (ws.length - 1) > video.width - 120) {
    size -= 4;
    ws = widths();
  }
  let x = (video.width - (ws.reduce((a, b) => a + b, 0) + gap() * (ws.length - 1))) / 2;
  ctx.textBaseline = "middle";
  c.words.forEach(([w, a], i) => {
    const active = t >= a - 0.05 && (i === c.words.length - 1 || t < c.words[i + 1][1] - 0.05);
    if (active) {
      ctx.fillStyle = "#ffd43b";
      ctx.beginPath();
      ctx.roundRect(x - 12, CAPTION_Y - size * 0.7, ws[i] + 24, size * 1.4, 14);
      ctx.fill();
    }
    ctx.font = CAPTION_FONT(size);
    ctx.fillStyle = t >= a - 0.05 ? "#1e1e1e" : "#868e96"; // words still to come are dimmed
    ctx.fillText(w, x, CAPTION_Y);
    x += ws[i] + gap();
  });
}

function seek(t: number) {
  if (!video) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = video.bg;
  ctx.fillRect(0, 0, video.width, video.height);
  const scenes = video.scenes;
  let i = 0;
  while (i + 1 < scenes.length && t >= scenes[i + 1].start) i++;
  const into = t - scenes[i].start;
  if (i > 0 && into < FADE) {
    // Outgoing scene lifts away while the next one begins.
    const e = ease(into / FADE);
    ctx.save();
    ctx.globalAlpha = 1 - e;
    ctx.translate(0, -120 * e);
    for (const el of scenes[i - 1].elements) drawAt(el, t);
    ctx.restore();
  }
  for (const el of scenes[i].elements) drawAt(el, t);
  drawCaption(t);
}

async function load(v: Video) {
  registerBundledFonts();
  await Promise.all(
    ['20px "Excalifont"', '20px "Lilita One"', '20px "Nunito"', 'italic 20px "Nunito"', CAPTION_FONT(20)].map((f) => document.fonts.load(f)),
  );
  await document.fonts.ready;
  // Images (icons) must be decoded before the first capture, or early frames show a grey placeholder.
  const srcs = new Set(v.scenes.flatMap((s) => s.elements.filter((e) => e.type === "image" && e.src).map((e) => e.src!)));
  await Promise.all([...srcs].map(preloadImage));
  canvas.width = v.width;
  canvas.height = v.height;
  video = { ...v, scenes: v.scenes.map((s) => ({ ...s, elements: refitAll(s.elements) })) };
  chunks = chunkWords(v.words);
  seek(0);
}

Object.assign(window, {
  __load: load,
  __seek: seek,
  __frame: (t: number, quality = 0.92) => (seek(t), canvas.toDataURL("image/jpeg", quality)),
});

import rough from "roughjs/bin/rough";
import type { Drawable, Options } from "roughjs/bin/core";
import type { RoughCanvas } from "roughjs/bin/canvas";
import { getStroke } from "perfect-freehand";
import type { SketchElement, TextLink, Theme } from "../types";
import { elementCenter } from "./geometry";
import { getRenderPoints } from "./linear";
import { hostOf } from "./embed";
import { fontStack } from "./fonts";

const generator = rough.generator();
export const CONTAINER_PADDING = 10;
export const LINE_HEIGHT = 1.25;
export const DARK_FILTER = "invert(93%) hue-rotate(180deg)";

export function isTextContainer(el: SketchElement): boolean {
  return el.type === "rectangle" || el.type === "diamond" || el.type === "ellipse";
}

export function roughOptionsFor(el: SketchElement): Options {
  const fill = el.backgroundColor && el.backgroundColor !== "transparent" ? el.backgroundColor : undefined;
  return {
    seed: el.seed,
    stroke: el.strokeColor,
    strokeWidth: el.strokeWidth,
    roughness: el.roughness,
    fill,
    fillStyle: fill ? (el.fillStyle === "none" ? "hachure" : el.fillStyle) : undefined,
    fillWeight: el.strokeWidth / 2,
    hachureGap: el.strokeWidth * 4,
    strokeLineDash:
      el.strokeStyle === "dashed"
        ? [el.strokeWidth * 4, el.strokeWidth * 3]
        : el.strokeStyle === "dotted"
          ? [el.strokeWidth, el.strokeWidth * 2.5]
          : undefined,
    disableMultiStroke: el.strokeStyle !== "solid",
    preserveVertices: el.roughness < 1,
  };
}

function roundedRectPath(w: number, h: number, r: number): string {
  const rx = w < 0 ? -r : r;
  const ry = h < 0 ? -r : r;
  return `M ${rx} 0 L ${w - rx} 0 Q ${w} 0 ${w} ${ry} L ${w} ${h - ry} Q ${w} ${h} ${w - rx} ${h} L ${rx} ${h} Q 0 ${h} 0 ${h - ry} L 0 ${ry} Q 0 0 ${rx} 0 Z`;
}

function arrowheadDrawables(from: [number, number], to: [number, number], len: number, type: string, opts: Options): Drawable[] {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0]);
  const spread = Math.PI / 7;
  const solid = { ...opts, fill: opts.stroke, fillStyle: "solid" as const, strokeLineDash: undefined };
  if (type === "dot") return [generator.circle(to[0], to[1], len / 1.5, solid)];
  if (type === "bar") {
    const perp = angle + Math.PI / 2;
    const hw = len / 2;
    return [
      generator.line(to[0] + Math.cos(perp) * hw, to[1] + Math.sin(perp) * hw, to[0] - Math.cos(perp) * hw, to[1] - Math.sin(perp) * hw, {
        ...opts,
        strokeLineDash: undefined,
      }),
    ];
  }
  const p1: [number, number] = [to[0] - len * Math.cos(angle - spread), to[1] - len * Math.sin(angle - spread)];
  const p2: [number, number] = [to[0] - len * Math.cos(angle + spread), to[1] - len * Math.sin(angle + spread)];
  if (type === "triangle") return [generator.polygon([to, p1, p2], solid)];
  const plain = { ...opts, strokeLineDash: undefined };
  return [generator.line(to[0], to[1], p1[0], p1[1], plain), generator.line(to[0], to[1], p2[0], p2[1], plain)];
}

function buildDrawable(el: SketchElement): Drawable[] {
  const opts = roughOptionsFor(el);
  switch (el.type) {
    case "rectangle": {
      if (el.roundness) {
        const r = Math.min(Math.abs(el.width), Math.abs(el.height)) * 0.12;
        return [generator.path(roundedRectPath(el.width, el.height, Math.min(r, 32)), opts)];
      }
      return [generator.rectangle(0, 0, el.width, el.height, opts)];
    }
    case "diamond": {
      const w = el.width;
      const h = el.height;
      if (el.roundness) {
        const r = Math.min(Math.abs(w), Math.abs(h)) * 0.08;
        const path = `M ${w / 2 + r} ${r / 2} L ${w - r / 2} ${h / 2 - r} Q ${w} ${h / 2} ${w - r / 2} ${h / 2 + r} L ${w / 2 + r} ${h - r / 2} Q ${w / 2} ${h} ${w / 2 - r} ${h - r / 2} L ${r / 2} ${h / 2 + r} Q 0 ${h / 2} ${r / 2} ${h / 2 - r} L ${w / 2 - r} ${r / 2} Q ${w / 2} 0 ${w / 2 + r} ${r / 2} Z`;
        return [generator.path(path, opts)];
      }
      return [
        generator.polygon(
          [
            [w / 2, 0],
            [w, h / 2],
            [w / 2, h],
            [0, h / 2],
          ],
          opts,
        ),
      ];
    }
    case "ellipse":
      return [generator.ellipse(el.width / 2, el.height / 2, Math.abs(el.width), Math.abs(el.height), opts)];
    case "line":
    case "arrow": {
      const pts = getRenderPoints(el).map((p) => [p[0], p[1]] as [number, number]);
      if (pts.length < 2) return [];
      const lineOpts = { ...opts, fill: undefined };
      const out: Drawable[] = [
        el.lineType === "curved" && pts.length > 2 ? generator.curve(pts, lineOpts) : generator.linearPath(pts, lineOpts),
      ];
      if (el.type === "arrow") {
        const headLen = Math.max(12, el.strokeWidth * 6);
        if (el.endArrowhead && el.endArrowhead !== "none") {
          out.push(...arrowheadDrawables(pts[pts.length - 2], pts[pts.length - 1], headLen, el.endArrowhead, lineOpts));
        }
        if (el.startArrowhead && el.startArrowhead !== "none") {
          out.push(...arrowheadDrawables(pts[1], pts[0], headLen, el.startArrowhead, lineOpts));
        }
      }
      return out;
    }
    default:
      return [];
  }
}

const drawableCache = new WeakMap<SketchElement, { key: string; drawable: Drawable[] }>();

function cacheKey(el: SketchElement): string {
  return [
    el.type,
    el.width,
    el.height,
    el.strokeColor,
    el.backgroundColor,
    el.fillStyle,
    el.strokeWidth,
    el.strokeStyle,
    el.roughness,
    el.roundness,
    el.seed,
    el.lineType,
    el.elbowDir,
    el.startArrowhead,
    el.endArrowhead,
    el.points ? el.points.join(";") : "",
  ].join("|");
}

export function getDrawables(el: SketchElement): Drawable[] {
  const key = cacheKey(el);
  const cached = drawableCache.get(el);
  if (cached && cached.key === key) return cached.drawable;
  const drawable = buildDrawable(el);
  drawableCache.set(el, { key, drawable });
  return drawable;
}

export function freehandOutline(el: SketchElement): number[][] {
  const pts = (el.points ?? []).map(([x, y], i) => [x, y, el.pressures?.[i] ?? 0.5]);
  return getStroke(pts, {
    size: Math.max(3, el.strokeWidth * 3.5),
    thinning: 0.6,
    smoothing: 0.5,
    streamline: 0.5,
    simulatePressure: !el.pressures,
    last: true,
  });
}

function freehandPath(el: SketchElement): Path2D {
  const stroke = freehandOutline(el);
  const path = new Path2D();
  if (stroke.length === 0) return path;
  path.moveTo(stroke[0][0], stroke[0][1]);
  for (let i = 1; i < stroke.length; i++) path.lineTo(stroke[i][0], stroke[i][1]);
  path.closePath();
  return path;
}

export { fontStack };

type FontProps = Pick<SketchElement, "fontSize" | "fontFamily" | "fontWeight" | "fontStyle">;

export function fontString(el: FontProps): string {
  return `${el.fontStyle === "italic" ? "italic " : ""}${el.fontWeight === "bold" ? 700 : 400} ${el.fontSize ?? 20}px ${fontStack(el.fontFamily)}`;
}

let measureCtx: CanvasRenderingContext2D | null = null;
function getMeasureCtx(): CanvasRenderingContext2D {
  measureCtx ??= document.createElement("canvas").getContext("2d")!;
  return measureCtx;
}

export function measureText(text: string, el: FontProps): { width: number; height: number } {
  const ctx = getMeasureCtx();
  ctx.font = fontString(el);
  const lines = text.split("\n");
  const width = Math.max(1, ...lines.map((l) => ctx.measureText(l || " ").width));
  return { width: Math.ceil(width), height: lines.length * (el.fontSize ?? 20) * LINE_HEIGHT };
}

export interface TextLine {
  text: string;
  /** offset of this line's first character in the element's full text */
  start: number;
}

const isSpace = (s: string) => /^\s+$/.test(s);

/**
 * Lines as rendered, each tagged with its offset into the source text so
 * character ranges (links) can be mapped onto wrapped lines. With no
 * maxWidth only hard line breaks split lines.
 */
export function layoutLines(text: string, maxWidth: number | null, el: FontProps): TextLine[] {
  const ctx = getMeasureCtx();
  ctx.font = fontString(el);
  const fits = (s: string) => maxWidth === null || ctx.measureText(s).width <= maxWidth;
  const out: TextLine[] = [];
  let offset = 0;
  for (const para of text.split("\n")) {
    if (maxWidth === null || para === "") {
      out.push({ text: para, start: offset });
      offset += para.length + 1;
      continue;
    }
    let line = "";
    let lineStart = offset;
    let wrapped = false;
    for (const m of para.matchAll(/\S+|\s+/g)) {
      const tok = m[0];
      const tokStart = offset + m.index!;
      if (wrapped && line === "" && isSpace(tok)) continue;
      if (line === "") lineStart = tokStart;
      if (fits(line + tok)) {
        line += tok;
        continue;
      }
      if (line !== "") {
        out.push({ text: line.trimEnd(), start: lineStart });
        wrapped = true;
        line = "";
        if (isSpace(tok)) continue;
        lineStart = tokStart;
      }
      // a single word wider than the line: break it by character
      let chunk = "";
      let chunkStart = tokStart;
      for (const ch of tok) {
        if (!fits(chunk + ch) && chunk) {
          out.push({ text: chunk, start: chunkStart });
          chunkStart += chunk.length;
          chunk = ch;
          wrapped = true;
        } else chunk += ch;
      }
      line = chunk;
      lineStart = chunkStart;
    }
    out.push({ text: line.trimEnd(), start: lineStart });
    offset += para.length + 1;
  }
  return out;
}

/** Back-compat helper: wrapped line strings only. */
export function wrapText(text: string, maxWidth: number, el: FontProps): string[] {
  return layoutLines(text, maxWidth, el).map((l) => l.text);
}

export function containerTextWidth(el: SketchElement): number {
  const w = Math.abs(el.width);
  const inner = el.type === "rectangle" ? w : w * 0.7;
  return Math.max(10, inner - CONTAINER_PADDING * 2);
}

export function containerTextHeight(el: SketchElement): number {
  if (!el.text) return 0;
  return layoutLines(el.text, containerTextWidth(el), el).length * (el.fontSize ?? 20) * LINE_HEIGHT;
}

export const LINK_COLOR = "#1971c2";

function textDecorationFor(el: SketchElement): string {
  if (el.textDecoration && el.textDecoration !== "none") return el.textDecoration;
  return el.link && el.type === "text" ? "underline" : "none";
}

export interface TextSegment {
  text: string;
  start: number;
  url: string | null;
}

/** Split a rendered line into runs that are inside / outside link ranges. */
export function lineSegments(line: TextLine, links: TextLink[] | undefined): TextSegment[] {
  if (!links?.length || !line.text) return [{ text: line.text, start: line.start, url: null }];
  const end = line.start + line.text.length;
  const cuts = new Set([line.start, end]);
  for (const l of links) {
    if (l.end <= line.start || l.start >= end) continue;
    cuts.add(Math.max(line.start, l.start));
    cuts.add(Math.min(end, l.end));
  }
  const pts = [...cuts].sort((a, b) => a - b);
  const segs: TextSegment[] = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const link = links.find((l) => l.start <= a && l.end >= b);
    segs.push({ text: line.text.slice(a - line.start, b - line.start), start: a, url: link?.url ?? null });
  }
  return segs;
}

/** Geometry shared by drawing, hit-testing and export, in the element's local (unrotated) space. */
export interface TextLayout {
  lines: TextLine[];
  boxX: number;
  boxWidth: number;
  startY: number;
  lineHeight: number;
  align: "left" | "center" | "right";
}

export function textLayout(el: SketchElement): TextLayout | null {
  if (!el.text) return null;
  const fontSize = el.fontSize ?? 20;
  const lineHeight = fontSize * LINE_HEIGHT;
  if (el.type === "text") {
    return { lines: layoutLines(el.text, null, el), boxX: 0, boxWidth: el.width, startY: 0, lineHeight, align: el.textAlign ?? "left" };
  }
  if (!isTextContainer(el)) return null;
  const boxWidth = containerTextWidth(el);
  const lines = layoutLines(el.text, boxWidth, el);
  const total = lines.length * lineHeight;
  const v = el.verticalAlign ?? "middle";
  const startY = v === "top" ? CONTAINER_PADDING : v === "bottom" ? el.height - total - CONTAINER_PADDING : (el.height - total) / 2;
  return { lines, boxX: (el.width - boxWidth) / 2, boxWidth, startY, lineHeight, align: el.textAlign ?? "center" };
}

function lineX(ctx: CanvasRenderingContext2D, layout: TextLayout, text: string) {
  const w = ctx.measureText(text).width;
  return layout.boxX + (layout.align === "center" ? (layout.boxWidth - w) / 2 : layout.align === "right" ? layout.boxWidth - w : 0);
}

function drawTextLayout(ctx: CanvasRenderingContext2D, el: SketchElement, layout: TextLayout, color: string) {
  const fontSize = el.fontSize ?? 20;
  ctx.font = fontString(el);
  ctx.textBaseline = "top";
  const deco = textDecorationFor(el);
  const thickness = Math.max(1, fontSize / 15);
  layout.lines.forEach((line, i) => {
    const y = layout.startY + i * layout.lineHeight + (layout.lineHeight - fontSize) / 2;
    let x = lineX(ctx, layout, line.text);
    for (const seg of lineSegments(line, el.textLinks)) {
      const w = ctx.measureText(seg.text).width;
      ctx.fillStyle = seg.url ? LINK_COLOR : color;
      ctx.fillText(seg.text, x, y);
      if (w > 0 && (seg.url || deco === "underline")) ctx.fillRect(x, y + fontSize * 1.02, w, thickness);
      if (w > 0 && deco === "line-through") ctx.fillRect(x, y + fontSize * 0.55, w, thickness);
      x += w;
    }
  });
}

/** The URL of the text link under a scene point, if any. */
export function textLinkAt(el: SketchElement, pt: { x: number; y: number }): string | null {
  if (!el.textLinks?.length) return null;
  const layout = textLayout(el);
  if (!layout) return null;
  const c = elementCenter(el);
  const cos = Math.cos(-el.angle);
  const sin = Math.sin(-el.angle);
  const dx = pt.x - c.x;
  const dy = pt.y - c.y;
  const lx = c.x + dx * cos - dy * sin - el.x;
  const ly = c.y + dx * sin + dy * cos - el.y;
  const row = Math.floor((ly - layout.startY) / layout.lineHeight);
  const line = layout.lines[row];
  if (!line) return null;
  const ctx = getMeasureCtx();
  ctx.font = fontString(el);
  let x = lineX(ctx, layout, line.text);
  for (const seg of lineSegments(line, el.textLinks)) {
    const w = ctx.measureText(seg.text).width;
    if (lx >= x && lx <= x + w) return seg.url;
    x += w;
  }
  return null;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawEmbedPlaceholder(ctx: CanvasRenderingContext2D, el: SketchElement) {
  const w = el.width;
  const h = el.height;
  roundRect(ctx, 0, 0, w, h, 8);
  ctx.fillStyle = "#f1f3f5";
  ctx.fill();
  ctx.strokeStyle = "#adb5bd";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = Math.max(10, Math.min(18, w / 18));
  ctx.fillStyle = "#495057";
  ctx.font = `600 ${size}px Inter, sans-serif`;
  ctx.fillText(hostOf(el.link) || "Web embed", w / 2, h / 2 - size * 0.7, w - 16);
  ctx.fillStyle = "#868e96";
  ctx.font = `400 ${size * 0.75}px Inter, sans-serif`;
  ctx.fillText(el.link ? "Double-click to interact" : "No URL yet", w / 2, h / 2 + size * 0.7, w - 16);
  ctx.textAlign = "start";
}

export function frameLabelHeight(zoom: number) {
  return 20 / zoom;
}

export function drawFrame(ctx: CanvasRenderingContext2D, el: SketchElement, zoom: number) {
  ctx.save();
  ctx.globalAlpha = el.opacity / 100;
  ctx.strokeStyle = "#a5a5a5";
  ctx.lineWidth = 1.5 / zoom;
  roundRect(ctx, el.x, el.y, el.width, el.height, 6 / zoom);
  ctx.stroke();
  ctx.font = `500 ${13 / zoom}px Inter, sans-serif`;
  ctx.fillStyle = "#868e96";
  ctx.textBaseline = "bottom";
  ctx.fillText(el.name || "Frame", el.x, el.y - 6 / zoom, Math.max(10, el.width));
  ctx.restore();
}

export function createRoughCanvas(canvas: HTMLCanvasElement): RoughCanvas {
  return rough.canvas(canvas, { options: {} });
}

export interface DrawOptions {
  theme?: Theme;
  hideText?: boolean;
}

export function drawElement(ctx: CanvasRenderingContext2D, el: SketchElement, rc: RoughCanvas, opts: DrawOptions = {}) {
  ctx.save();
  ctx.globalAlpha = el.opacity / 100;
  const center = elementCenter(el);
  ctx.translate(el.x, el.y);
  if (el.angle) {
    ctx.translate(center.x - el.x, center.y - el.y);
    ctx.rotate(el.angle);
    ctx.translate(-(center.x - el.x), -(center.y - el.y));
  }

  switch (el.type) {
    case "draw": {
      ctx.fillStyle = el.strokeColor;
      ctx.fill(freehandPath(el));
      break;
    }
    case "text": {
      const layout = !opts.hideText && textLayout(el);
      if (layout) drawTextLayout(ctx, el, layout, el.strokeColor);
      break;
    }
    case "image": {
      const img = imageCache.get(el.src ?? "");
      if (img && img.complete && img.naturalWidth) {
        if (el.flipX || el.flipY) {
          ctx.translate(el.flipX ? el.width : 0, el.flipY ? el.height : 0);
          ctx.scale(el.flipX ? -1 : 1, el.flipY ? -1 : 1);
        }
        // Dark mode inverts the whole canvas via CSS; pre-inverting cancels that
        // so photos don't render as negatives.
        ctx.filter = opts.theme === "dark" ? DARK_FILTER : "none";
        ctx.drawImage(img, 0, 0, el.width, el.height);
        ctx.filter = "none";
      } else if (el.src) {
        loadImage(el.src);
        ctx.fillStyle = "#e9ecef";
        ctx.fillRect(0, 0, el.width, el.height);
      }
      break;
    }
    case "embed":
      drawEmbedPlaceholder(ctx, el);
      break;
    case "frame":
      break;
    default: {
      for (const d of getDrawables(el)) rc.draw(d);
      const layout = isTextContainer(el) && !opts.hideText && textLayout(el);
      if (layout) drawTextLayout(ctx, el, layout, el.textColor ?? el.strokeColor);
    }
  }
  ctx.restore();
}

/** Draw a whole scene in its natural order, clipping frame children to their frame. */
export function renderScene(
  ctx: CanvasRenderingContext2D,
  elements: SketchElement[],
  rc: RoughCanvas,
  opts: { zoom: number; theme?: Theme; hiddenTextIds?: Set<string>; skipIds?: Set<string> },
) {
  const frames = new Map(elements.filter((e) => e.type === "frame").map((f) => [f.id, f]));
  for (const el of elements) {
    if (el.type === "frame" || opts.skipIds?.has(el.id)) continue;
    const frame = el.frameId ? frames.get(el.frameId) : undefined;
    const drawOpts = { theme: opts.theme, hideText: opts.hiddenTextIds?.has(el.id) };
    if (frame) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(frame.x, frame.y, frame.width, frame.height);
      ctx.clip();
      drawElement(ctx, el, rc, drawOpts);
      ctx.restore();
    } else {
      drawElement(ctx, el, rc, drawOpts);
    }
  }
  for (const f of frames.values()) {
    if (!opts.skipIds?.has(f.id)) drawFrame(ctx, f, opts.zoom);
  }
}

const imageCache = new Map<string, HTMLImageElement>();
const imageListeners = new Set<() => void>();

export function subscribeImageLoads(fn: () => void): () => void {
  imageListeners.add(fn);
  return () => imageListeners.delete(fn);
}

function loadImage(src: string) {
  if (imageCache.has(src)) return;
  const img = new Image();
  img.onload = () => imageListeners.forEach((f) => f());
  img.src = src;
  imageCache.set(src, img);
}

export function preloadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const existing = imageCache.get(src);
    if (existing && existing.complete && existing.naturalWidth) {
      resolve(existing);
      return;
    }
    const img = new Image();
    img.onload = () => {
      imageCache.set(src, img);
      imageListeners.forEach((f) => f());
      resolve(img);
    };
    img.onerror = reject;
    img.src = src;
  });
}

export async function preloadSceneImages(elements: SketchElement[]): Promise<void> {
  await Promise.all(elements.filter((e) => e.type === "image" && e.src).map((e) => preloadImage(e.src!).catch(() => undefined)));
}

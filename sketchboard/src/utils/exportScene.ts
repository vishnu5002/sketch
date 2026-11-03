import rough from "roughjs/bin/rough";
import {
  DARK_FILTER,
  LINK_COLOR,
  lineSegments,
  textLayout,
  createRoughCanvas,
  fontStack,
  freehandOutline,
  getDrawables,
  isTextContainer,
  preloadSceneImages,
  renderScene,
} from "./renderer";
import { getCommonBounds } from "./geometry";
import { hostOf } from "./embed";
import { fontCssForExport, loadFonts } from "./fonts";
import { inlineImages } from "./images";
import type { Bounds, DocumentFile, SketchElement } from "../types";
import { isInternalLink } from "./internalLinks";

export interface ExportOptions {
  background: string | null;
  scale: number;
  dark: boolean;
  padding?: number;
}

function sceneBounds(elements: SketchElement[]): Bounds {
  const b = getCommonBounds(elements) ?? { x1: 0, y1: 0, x2: 400, y2: 300 };
  // frame labels sit above the frame's top edge
  const hasFrame = elements.some((e) => e.type === "frame");
  return hasFrame ? { ...b, y1: b.y1 - 24 } : b;
}

export async function renderElementsToCanvas(elements: SketchElement[], opts: ExportOptions): Promise<HTMLCanvasElement> {
  await Promise.all([preloadSceneImages(elements), loadFonts(elements.filter((e) => e.text).map((e) => e.fontFamily))]);
  const pad = opts.padding ?? 20;
  const b = sceneBounds(elements);
  const width = Math.max(1, b.x2 - b.x1 + pad * 2);
  const height = Math.max(1, b.y2 - b.y1 + pad * 2);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * opts.scale);
  canvas.height = Math.ceil(height * opts.scale);
  const ctx = canvas.getContext("2d")!;
  ctx.scale(opts.scale, opts.scale);
  if (opts.background) {
    ctx.fillStyle = opts.background;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.translate(-b.x1 + pad, -b.y1 + pad);
  renderScene(ctx, elements, createRoughCanvas(canvas), { zoom: 1, theme: opts.dark ? "dark" : "light" });
  if (!opts.dark) return canvas;
  const out = document.createElement("canvas");
  out.width = canvas.width;
  out.height = canvas.height;
  const octx = out.getContext("2d")!;
  octx.filter = DARK_FILTER;
  octx.drawImage(canvas, 0, 0);
  return out;
}

export async function exportToPNGBlob(elements: SketchElement[], opts: ExportOptions): Promise<Blob> {
  const canvas = await renderElementsToCanvas(elements, opts);
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png"));
}

const SVG_NS = "http://www.w3.org/2000/svg";

function svgEl<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
}

/** Text as SVG, following the same layout as the canvas; linked runs become <a> links. */
function svgText(el: SketchElement, color: string): SVGGElement | null {
  const layout = textLayout(el);
  if (!layout) return null;
  const g = svgEl("g", {});
  const fontSize = el.fontSize ?? 20;
  const anchor = layout.align === "center" ? "middle" : layout.align === "right" ? "end" : "start";
  const x = layout.boxX + (layout.align === "center" ? layout.boxWidth / 2 : layout.align === "right" ? layout.boxWidth : 0);
  const deco = el.textDecoration && el.textDecoration !== "none" ? el.textDecoration : el.link && el.type === "text" ? "underline" : "none";
  layout.lines.forEach((line, i) => {
    const t = svgEl("text", {
      x,
      y: layout.startY + i * layout.lineHeight + (layout.lineHeight - fontSize) / 2 + fontSize * 0.8,
      "font-family": fontStack(el.fontFamily).replace(/"/g, "'"),
      "font-size": fontSize,
      "font-weight": el.fontWeight === "bold" ? 700 : 400,
      "font-style": el.fontStyle === "italic" ? "italic" : "normal",
      "text-decoration": deco,
      "text-anchor": anchor,
      fill: color,
      style: "white-space: pre",
    });
    for (const seg of lineSegments(line, el.textLinks)) {
      const span = svgEl("tspan", seg.url ? { fill: LINK_COLOR, "text-decoration": "underline" } : {});
      span.textContent = seg.text;
      if (seg.url && !isInternalLink(seg.url)) {
        const a = svgEl("a", { href: seg.url, target: "_blank" });
        a.appendChild(span);
        t.appendChild(a);
      } else t.appendChild(span);
    }
    g.appendChild(t);
  });
  return g;
}

export async function exportToSVGString(source: SketchElement[], opts: Omit<ExportOptions, "scale">): Promise<string> {
  // A standalone SVG can't point at the local service, so images are embedded.
  const elements = await inlineImages(source);
  const pad = opts.padding ?? 20;
  const b = sceneBounds(elements);
  const width = b.x2 - b.x1 + pad * 2;
  const height = b.y2 - b.y1 + pad * 2;
  const svg = svgEl("svg", { xmlns: SVG_NS, width, height, viewBox: `0 0 ${width} ${height}` });
  const defs = svgEl("defs", {});
  const style = svgEl("style", {});
  style.textContent = await fontCssForExport(elements.filter((e) => e.text).map((e) => e.fontFamily));
  defs.appendChild(style);
  svg.appendChild(defs);
  if (opts.background) svg.appendChild(svgEl("rect", { x: 0, y: 0, width, height, fill: opts.background }));

  const root = svgEl("g", { transform: `translate(${-b.x1 + pad} ${-b.y1 + pad})` });
  if (opts.dark) root.setAttribute("style", `filter: ${DARK_FILTER}`);
  svg.appendChild(root);
  const rs = rough.svg(svg);

  const frames = new Map(elements.filter((e) => e.type === "frame").map((f) => [f.id, f]));
  for (const f of frames.values()) {
    const clip = svgEl("clipPath", { id: `clip-${f.id}` });
    clip.appendChild(svgEl("rect", { x: f.x, y: f.y, width: f.width, height: f.height }));
    defs.appendChild(clip);
  }

  for (const el of [...elements.filter((e) => e.type !== "frame"), ...frames.values()]) {
    const deg = (el.angle * 180) / Math.PI;
    let g: SVGElement = svgEl("g", {
      transform: `translate(${el.x} ${el.y}) rotate(${deg} ${el.width / 2} ${el.height / 2})`,
      opacity: el.opacity / 100,
    });
    switch (el.type) {
      case "draw": {
        const outline = freehandOutline(el);
        if (outline.length) {
          const d = "M " + outline.map((p) => `${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(" L ") + " Z";
          g.appendChild(svgEl("path", { d, fill: el.strokeColor }));
        }
        break;
      }
      case "text":
        {
          const tg = svgText(el, el.strokeColor);
          if (tg) g.appendChild(tg);
        }
        break;
      case "image": {
        const img = svgEl("image", { href: el.src ?? "", width: el.width, height: el.height, preserveAspectRatio: "none" });
        if (el.flipX || el.flipY) {
          img.setAttribute("transform", `translate(${el.flipX ? el.width : 0} ${el.flipY ? el.height : 0}) scale(${el.flipX ? -1 : 1} ${el.flipY ? -1 : 1})`);
        }
        if (opts.dark) img.setAttribute("style", `filter: ${DARK_FILTER}`);
        g.appendChild(img);
        break;
      }
      case "embed": {
        g.appendChild(svgEl("rect", { width: el.width, height: el.height, rx: 8, fill: "#f1f3f5", stroke: "#adb5bd" }));
        const t = svgEl("text", { x: el.width / 2, y: el.height / 2, "text-anchor": "middle", "font-family": "Inter, sans-serif", "font-size": 16, fill: "#495057" });
        t.textContent = hostOf(el.link) || "Web embed";
        g.appendChild(t);
        break;
      }
      case "frame": {
        g.appendChild(svgEl("rect", { width: el.width, height: el.height, rx: 6, fill: "none", stroke: "#a5a5a5", "stroke-width": 1.5 }));
        const t = svgEl("text", { x: 0, y: -6, "font-family": "Inter, sans-serif", "font-size": 13, fill: "#868e96" });
        t.textContent = el.name || "Frame";
        g.appendChild(t);
        break;
      }
      default: {
        for (const d of getDrawables(el)) g.appendChild(rs.draw(d));
        const tg = isTextContainer(el) ? svgText(el, el.textColor ?? el.strokeColor) : null;
        if (tg) g.appendChild(tg);
      }
    }
    if (el.link && !isInternalLink(el.link)) {
      const a = svgEl("a", { href: el.link, target: "_blank" });
      a.appendChild(g);
      g = a;
    }
    const frame = el.frameId ? frames.get(el.frameId) : undefined;
    if (frame) {
      const clipped = svgEl("g", { "clip-path": `url(#clip-${frame.id})` });
      clipped.appendChild(g);
      root.appendChild(clipped);
    } else {
      root.appendChild(g);
    }
  }
  return new XMLSerializer().serializeToString(svg);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function copyPNGToClipboard(elements: SketchElement[], opts: ExportOptions): Promise<void> {
  // Passing the promise (not the resolved blob) keeps Safari's user-activation window open.
  await navigator.clipboard.write([new ClipboardItem({ "image/png": exportToPNGBlob(elements, opts) })]);
}

export async function copySVGToClipboard(elements: SketchElement[], opts: Omit<ExportOptions, "scale">): Promise<void> {
  await navigator.clipboard.writeText(await exportToSVGString(elements, opts));
}

export function parseDocument(text: string): DocumentFile | { elements: SketchElement[] } {
  const data = JSON.parse(text);
  if (data && Array.isArray(data.pages) && data.pages.length > 0) return data as DocumentFile;
  if (data && Array.isArray(data.elements)) return { elements: data.elements };
  throw new Error("Not a sketchboard file");
}

export function readFileAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsText(file);
  });
}

export function readImageFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

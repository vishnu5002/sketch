import type { Bounds, Point } from "../types";

export interface Guide {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export const GRID_SIZE = 20;

const xs = (b: Bounds) => [b.x1, (b.x1 + b.x2) / 2, b.x2];
const ys = (b: Bounds) => [b.y1, (b.y1 + b.y2) / 2, b.y2];

function bestOffset(moving: number[], candidates: number[], threshold: number): number | null {
  let best: number | null = null;
  for (const m of moving) {
    for (const c of candidates) {
      const d = c - m;
      if (Math.abs(d) <= threshold && (best === null || Math.abs(d) < Math.abs(best))) best = d;
    }
  }
  return best;
}

function buildGuides(sel: Bounds, others: Bounds[]): Guide[] {
  const guides: Guide[] = [];
  for (const v of xs(sel)) {
    const hits = others.filter((o) => xs(o).some((x) => Math.abs(x - v) < 0.5));
    if (hits.length) {
      const y1 = Math.min(sel.y1, ...hits.map((h) => h.y1));
      const y2 = Math.max(sel.y2, ...hits.map((h) => h.y2));
      guides.push({ x1: v, y1, x2: v, y2 });
    }
  }
  for (const v of ys(sel)) {
    const hits = others.filter((o) => ys(o).some((y) => Math.abs(y - v) < 0.5));
    if (hits.length) {
      const x1 = Math.min(sel.x1, ...hits.map((h) => h.x1));
      const x2 = Math.max(sel.x2, ...hits.map((h) => h.x2));
      guides.push({ x1, y1: v, x2, y2: v });
    }
  }
  return guides;
}

/** Snap a moving selection's edges/centers to other elements' edges/centers. */
export function snapBounds(origin: Bounds, dx: number, dy: number, others: Bounds[], threshold: number) {
  const moved = { x1: origin.x1 + dx, y1: origin.y1 + dy, x2: origin.x2 + dx, y2: origin.y2 + dy };
  const offX = bestOffset(xs(moved), others.flatMap(xs), threshold);
  const offY = bestOffset(ys(moved), others.flatMap(ys), threshold);
  const ndx = dx + (offX ?? 0);
  const ndy = dy + (offY ?? 0);
  const snapped = { x1: origin.x1 + ndx, y1: origin.y1 + ndy, x2: origin.x2 + ndx, y2: origin.y2 + ndy };
  return { dx: ndx, dy: ndy, guides: offX === null && offY === null ? [] : buildGuides(snapped, others) };
}

export function snapPoint(p: Point, others: Bounds[], threshold: number) {
  const offX = bestOffset([p.x], others.flatMap(xs), threshold);
  const offY = bestOffset([p.y], others.flatMap(ys), threshold);
  const point = { x: p.x + (offX ?? 0), y: p.y + (offY ?? 0) };
  const pb = { x1: point.x, y1: point.y, x2: point.x, y2: point.y };
  return { point, guides: offX === null && offY === null ? [] : buildGuides(pb, others) };
}

export function snapToGrid(v: number, size = GRID_SIZE): number {
  return Math.round(v / size) * size;
}

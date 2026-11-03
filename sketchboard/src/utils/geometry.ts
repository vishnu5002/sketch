import type { Bounds, Point, SketchElement } from "../types";
import { getRenderPoints } from "./linear";

export function rotatePoint(p: Point, center: Point, angle: number): Point {
  if (!angle) return p;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = p.x - center.x;
  const dy = p.y - center.y;
  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
  };
}

export function elementCenter(el: SketchElement): Point {
  return { x: el.x + el.width / 2, y: el.y + el.height / 2 };
}

/** Normalized bounding box in absolute scene coordinates, ignoring rotation. */
export function getElementBounds(el: SketchElement): Bounds {
  const x1 = Math.min(el.x, el.x + el.width);
  const y1 = Math.min(el.y, el.y + el.height);
  const x2 = Math.max(el.x, el.x + el.width);
  const y2 = Math.max(el.y, el.y + el.height);
  return { x1, y1, x2, y2 };
}

/** Axis-aligned bounds of the rotated element. */
export function getRotatedBounds(el: SketchElement): Bounds {
  const { x1, y1, x2, y2 } = getElementBounds(el);
  if (!el.angle) return { x1, y1, x2, y2 };
  const center = elementCenter(el);
  const corners = [
    { x: x1, y: y1 },
    { x: x2, y: y1 },
    { x: x2, y: y2 },
    { x: x1, y: y2 },
  ].map((p) => rotatePoint(p, center, el.angle));
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return { x1: Math.min(...xs), y1: Math.min(...ys), x2: Math.max(...xs), y2: Math.max(...ys) };
}

export function getCommonBounds(els: SketchElement[]): Bounds | null {
  if (els.length === 0) return null;
  let x1 = Infinity,
    y1 = Infinity,
    x2 = -Infinity,
    y2 = -Infinity;
  for (const el of els) {
    const b = getRotatedBounds(el);
    x1 = Math.min(x1, b.x1);
    y1 = Math.min(y1, b.y1);
    x2 = Math.max(x2, b.x2);
    y2 = Math.max(y2, b.y2);
  }
  return { x1, y1, x2, y2 };
}

export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Scene-space positions of a linear/freehand element's rendered points, rotation applied. */
export function getWorldPoints(el: SketchElement, rendered = false): Point[] {
  const center = elementCenter(el);
  const pts = rendered ? getRenderPoints(el) : el.points ?? [];
  return pts.map((p) => rotatePoint({ x: el.x + p[0], y: el.y + p[1] }, center, el.angle));
}

export function hitTestElement(point: Point, el: SketchElement, threshold = 6): boolean {
  if (el.type === "line" || el.type === "arrow" || el.type === "draw") {
    const pts = getWorldPoints(el, true);
    const t = threshold + (el.type === "draw" ? el.strokeWidth * 2 : el.strokeWidth / 2);
    for (let i = 0; i < pts.length - 1; i++) {
      if (distanceToSegment(point, pts[i], pts[i + 1]) <= t) return true;
    }
    if (pts.length === 1) return Math.hypot(point.x - pts[0].x, point.y - pts[0].y) <= t;
    return false;
  }

  const center = elementCenter(el);
  const local = rotatePoint(point, center, -el.angle);
  const { x1, y1, x2, y2 } = getElementBounds(el);

  if (el.type === "frame") {
    const inside = local.x >= x1 - threshold && local.x <= x2 + threshold && local.y >= y1 - threshold && local.y <= y2 + threshold;
    const deep = local.x > x1 + threshold && local.x < x2 - threshold && local.y > y1 + threshold && local.y < y2 - threshold;
    return inside && !deep;
  }

  return local.x >= x1 - threshold && local.x <= x2 + threshold && local.y >= y1 - threshold && local.y <= y2 + threshold;
}

export function elementsIntersectRect(el: SketchElement, rect: Bounds): boolean {
  const b = getRotatedBounds(el);
  return !(b.x2 < rect.x1 || b.x1 > rect.x2 || b.y2 < rect.y1 || b.y1 > rect.y2);
}

export function rectContainsRect(outer: Bounds, inner: Bounds): boolean {
  return inner.x1 >= outer.x1 && inner.y1 >= outer.y1 && inner.x2 <= outer.x2 && inner.y2 <= outer.y2;
}

export function pointInBounds(p: Point, b: Bounds): boolean {
  return p.x >= b.x1 && p.x <= b.x2 && p.y >= b.y1 && p.y <= b.y2;
}

export function normalizeRect(x: number, y: number, w: number, h: number) {
  return {
    x: w < 0 ? x + w : x,
    y: h < 0 ? y + h : y,
    width: Math.abs(w),
    height: Math.abs(h),
  };
}

export function getPointsBounds(points: [number, number][]) {
  if (points.length === 0) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  for (const [x, y] of points) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return { minX, minY, maxX, maxY };
}

/** Rebase scene-space points into an element's x/y/width/height/points (angle reset to 0). */
export function fromWorldPoints(pts: Point[]): Pick<SketchElement, "x" | "y" | "width" | "height" | "points" | "angle"> {
  const minX = Math.min(...pts.map((p) => p.x));
  const minY = Math.min(...pts.map((p) => p.y));
  const maxX = Math.max(...pts.map((p) => p.x));
  const maxY = Math.max(...pts.map((p) => p.y));
  return {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    angle: 0,
    points: pts.map((p) => [p.x - minX, p.y - minY] as [number, number]),
  };
}

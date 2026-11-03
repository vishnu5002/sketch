import type { Point, SketchElement } from "../types";
import { elementCenter, fromWorldPoints, getElementBounds, getWorldPoints, hitTestElement, rotatePoint } from "./geometry";

const BINDABLE = new Set(["rectangle", "diamond", "ellipse", "text", "image", "embed"]);
const GAP = 6;

export function isBindable(el: SketchElement): boolean {
  return BINDABLE.has(el.type);
}

/** Where an arrow aimed from `ref` toward `target`'s center meets its outline (plus a small gap). */
function boundaryPoint(target: SketchElement, ref: Point, elbow: "h" | "v" | null): Point {
  const c = elementCenter(target);
  const local = rotatePoint(ref, c, -target.angle);
  const { x1, y1, x2, y2 } = getElementBounds(target);
  const hw = Math.max(1, (x2 - x1) / 2);
  const hh = Math.max(1, (y2 - y1) / 2);
  const dx = local.x - c.x;
  const dy = local.y - c.y;
  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) return c;

  let p: Point;
  if (elbow) {
    // Elbow connectors look right only when they leave a side's midpoint, on the
    // same axis the route's first/last segment travels along.
    p = elbow === "h" ? { x: c.x + Math.sign(dx || 1) * (hw + GAP), y: c.y } : { x: c.x, y: c.y + Math.sign(dy || 1) * (hh + GAP) };
  } else {
    let s: number;
    if (target.type === "ellipse") s = 1 / Math.sqrt((dx / hw) ** 2 + (dy / hh) ** 2);
    else if (target.type === "diamond") s = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
    else s = 1 / Math.max(Math.abs(dx) / hw, Math.abs(dy) / hh);
    const len = Math.hypot(dx, dy);
    p = { x: c.x + dx * s + (dx / len) * GAP, y: c.y + dy * s + (dy / len) * GAP };
  }
  return rotatePoint(p, c, target.angle);
}

export function computeBoundArrow(arrow: SketchElement, byId: Map<string, SketchElement>): Partial<SketchElement> | null {
  const startT = arrow.startBinding ? byId.get(arrow.startBinding.elementId) : undefined;
  const endT = arrow.endBinding ? byId.get(arrow.endBinding.elementId) : undefined;
  if (!startT && !endT) return null;
  const pts = getWorldPoints(arrow);
  const n = pts.length;
  if (n < 2) return null;
  // With only two points, aiming each end at the other end's *target* keeps the
  // pair stable instead of each endpoint chasing the other's last position.
  const startRef = n === 2 && endT ? elementCenter(endT) : pts[1];
  const endRef = n === 2 && startT ? elementCenter(startT) : pts[n - 2];
  let elbow: "h" | "v" | null = null;
  if (arrow.lineType === "elbow") {
    const a = startT ? elementCenter(startT) : pts[0];
    const b = endT ? elementCenter(endT) : pts[n - 1];
    elbow = Math.abs(b.x - a.x) >= Math.abs(b.y - a.y) ? "h" : "v";
  }
  if (startT) pts[0] = boundaryPoint(startT, startRef, elbow);
  if (endT) pts[n - 1] = boundaryPoint(endT, endRef, elbow);
  return { ...fromWorldPoints(pts), elbowDir: elbow ?? undefined };
}

/** Re-snap arrows bound to any of `changedIds` (or all bound arrows when omitted). */
export function refreshBindings(elements: SketchElement[], changedIds?: Set<string>): SketchElement[] {
  let byId: Map<string, SketchElement> | null = null;
  let out = elements;
  for (let i = 0; i < elements.length; i++) {
    const el = elements[i];
    if (el.type !== "arrow") continue;
    const s = el.startBinding?.elementId;
    const e = el.endBinding?.elementId;
    if (!s && !e) continue;
    if (changedIds && !(s && changedIds.has(s)) && !(e && changedIds.has(e))) continue;
    byId ??= new Map(elements.map((x) => [x.id, x]));
    let fixed = el;
    if (s && !byId.has(s)) fixed = { ...fixed, startBinding: null };
    if (e && !byId.has(e)) fixed = { ...fixed, endBinding: null };
    const patch = computeBoundArrow(fixed, byId);
    if (patch || fixed !== el) {
      if (out === elements) out = [...elements];
      out[i] = { ...fixed, ...patch };
    }
  }
  return out;
}

export function findBindTarget(point: Point, elements: SketchElement[], excludeId: string, zoom: number): SketchElement | null {
  for (let i = elements.length - 1; i >= 0; i--) {
    const el = elements[i];
    if (el.id === excludeId || !isBindable(el)) continue;
    if (hitTestElement(point, el, 12 / zoom)) return el;
  }
  return null;
}

/** Drop bindings and frame membership that point at elements no longer present. */
export function cleanupReferences(elements: SketchElement[]): SketchElement[] {
  const ids = new Set(elements.map((e) => e.id));
  return elements.map((el) => {
    let next = el;
    if (el.startBinding && !ids.has(el.startBinding.elementId)) next = { ...next, startBinding: null };
    if (el.endBinding && !ids.has(el.endBinding.elementId)) next = { ...next, endBinding: null };
    if (el.frameId && !ids.has(el.frameId)) next = { ...next, frameId: null };
    return next;
  });
}

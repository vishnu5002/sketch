import type { SketchElement } from "../types";
import { getElementBounds, getRotatedBounds, rectContainsRect } from "./geometry";

/** The topmost frame that fully contains `el`, if any. Partial overlap never clips an element. */
export function frameAt(el: SketchElement, frames: SketchElement[]): string | null {
  const b = getRotatedBounds(el);
  for (let i = frames.length - 1; i >= 0; i--) {
    if (frames[i].id === el.id) continue;
    const f = getElementBounds(frames[i]);
    if (rectContainsRect({ x1: f.x1 - 1, y1: f.y1 - 1, x2: f.x2 + 1, y2: f.y2 + 1 }, b)) return frames[i].id;
  }
  return null;
}

/** Recompute which frame each element (or just `ids`) belongs to. */
export function assignFrames(elements: SketchElement[], ids?: Set<string>): SketchElement[] {
  const frames = elements.filter((e) => e.type === "frame");
  let out = elements;
  elements.forEach((el, i) => {
    if (el.type === "frame" || (ids && !ids.has(el.id))) return;
    const frameId = frames.length ? frameAt(el, frames) : null;
    if ((el.frameId ?? null) !== frameId) {
      if (out === elements) out = [...elements];
      out[i] = { ...el, frameId };
    }
  });
  return out;
}

export function frameChildren(elements: SketchElement[], frameIds: Set<string>): SketchElement[] {
  return elements.filter((e) => e.frameId && frameIds.has(e.frameId));
}

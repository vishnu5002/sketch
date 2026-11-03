import type { SketchElement } from "../types";
import { makeId } from "./id";

/**
 * Copy elements with fresh ids, remapping group/frame/binding references that
 * point inside the copied set so copies don't stay entangled with originals.
 */
export function cloneElements(els: SketchElement[], dx = 0, dy = 0): SketchElement[] {
  const idMap = new Map(els.map((e) => [e.id, makeId()]));
  const groupMap = new Map<string, string>();
  const remapGroup = (g: string | null) => {
    if (!g) return null;
    if (!groupMap.has(g)) groupMap.set(g, makeId());
    return groupMap.get(g)!;
  };
  return els.map((e) => ({
    ...e,
    id: idMap.get(e.id)!,
    x: e.x + dx,
    y: e.y + dy,
    groupId: remapGroup(e.groupId),
    frameId: e.frameId ? idMap.get(e.frameId) ?? e.frameId : null,
    startBinding: e.startBinding && idMap.has(e.startBinding.elementId) ? { elementId: idMap.get(e.startBinding.elementId)! } : null,
    endBinding: e.endBinding && idMap.has(e.endBinding.elementId) ? { elementId: idMap.get(e.endBinding.elementId)! } : null,
    points: e.points?.map((p) => [p[0], p[1]] as [number, number]),
    locked: false,
  }));
}

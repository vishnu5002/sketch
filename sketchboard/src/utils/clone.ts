import type { SketchElement } from "../types";
import { makeId } from "./id";
import { relink, type RelinkOptions } from "./internalLinks";

/**
 * Copy elements with fresh ids, remapping group/frame/binding references that
 * point inside the copied set so copies don't stay entangled with originals.
 * Links into the drawing between copied elements follow the copies too.
 */
export function cloneElements(els: SketchElement[], dx = 0, dy = 0, links: RelinkOptions = {}): SketchElement[] {
  const idMap = new Map(els.map((e) => [e.id, makeId()]));
  const relinkText = (e: SketchElement) => {
    if (!e.textLinks?.length) return e.textLinks;
    const out = e.textLinks.flatMap((l) => {
      const url = relink(l.url, idMap, links);
      return url ? [{ ...l, url }] : [];
    });
    return out.length ? out : undefined;
  };
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
    link: e.link ? relink(e.link, idMap, links) : e.link,
    textLinks: relinkText(e),
    locked: false,
  }));
}

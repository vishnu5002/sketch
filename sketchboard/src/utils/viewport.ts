import type { Point, Viewport } from "../types";

export function screenToScene(p: Point, viewport: Viewport): Point {
  return { x: p.x / viewport.zoom - viewport.scrollX, y: p.y / viewport.zoom - viewport.scrollY };
}

export function sceneToScreen(p: Point, viewport: Viewport): Point {
  return { x: (p.x + viewport.scrollX) * viewport.zoom, y: (p.y + viewport.scrollY) * viewport.zoom };
}

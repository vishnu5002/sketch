import type { SketchElement } from "../types";

/** Points actually rendered for a linear element — elbow arrows are routed orthogonally between stored waypoints. */
export function getRenderPoints(el: SketchElement): [number, number][] {
  const pts = el.points ?? [];
  if ((el.type !== "arrow" && el.type !== "line") || el.lineType !== "elbow" || pts.length < 2) return pts;
  const out: [number, number][] = [pts[0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i];
    const b = pts[i + 1];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const horizontal = pts.length === 2 && el.elbowDir ? el.elbowDir === "h" : Math.abs(dx) >= Math.abs(dy);
    if (horizontal) {
      const mx = a[0] + dx / 2;
      out.push([mx, a[1]], [mx, b[1]], b);
    } else {
      const my = a[1] + dy / 2;
      out.push([a[0], my], [b[0], my], b);
    }
  }
  return out.filter((p, i) => i === 0 || p[0] !== out[i - 1][0] || p[1] !== out[i - 1][1]);
}

export function isLinear(el: SketchElement): boolean {
  return el.type === "arrow" || el.type === "line";
}

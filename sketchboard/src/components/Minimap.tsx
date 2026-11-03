import { useEffect, useRef } from "react";
import { useStore } from "../store";
import { getCommonBounds, getRotatedBounds, getWorldPoints } from "../utils/geometry";
import { screenToScene } from "../utils/viewport";
import type { Bounds } from "../types";

const W = 200;
const H = 140;

export default function Minimap() {
  const show = useStore((s) => s.showMinimap);
  const elements = useStore((s) => s.elements);
  const viewport = useStore((s) => s.viewport);
  const theme = useStore((s) => s.theme);
  const ref = useRef<HTMLCanvasElement>(null);
  const mapRef = useRef<{ scale: number; ox: number; oy: number } | null>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!show || !canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const tl = screenToScene({ x: 0, y: 0 }, viewport);
    const br = screenToScene({ x: window.innerWidth, y: window.innerHeight }, viewport);
    const view: Bounds = { x1: tl.x, y1: tl.y, x2: br.x, y2: br.y };
    const content = getCommonBounds(elements) ?? view;
    const all = { x1: Math.min(view.x1, content.x1), y1: Math.min(view.y1, content.y1), x2: Math.max(view.x2, content.x2), y2: Math.max(view.y2, content.y2) };
    const pad = 0.06;
    const bw = (all.x2 - all.x1) * (1 + pad * 2);
    const bh = (all.y2 - all.y1) * (1 + pad * 2);
    const scale = Math.min(W / bw, H / bh);
    const ox = (W - (all.x2 - all.x1) * scale) / 2 - all.x1 * scale;
    const oy = (H - (all.y2 - all.y1) * scale) / 2 - all.y1 * scale;
    mapRef.current = { scale, ox, oy };

    const ink = theme === "dark" ? "rgba(220,220,230,0.55)" : "rgba(60,60,70,0.45)";
    ctx.strokeStyle = ink;
    ctx.fillStyle = theme === "dark" ? "rgba(220,220,230,0.15)" : "rgba(60,60,70,0.12)";
    ctx.lineWidth = 1;
    for (const el of elements) {
      if (el.type === "line" || el.type === "arrow" || el.type === "draw") {
        const pts = getWorldPoints(el, true);
        ctx.beginPath();
        pts.forEach((p, i) => (i ? ctx.lineTo(p.x * scale + ox, p.y * scale + oy) : ctx.moveTo(p.x * scale + ox, p.y * scale + oy)));
        ctx.stroke();
        continue;
      }
      const b = getRotatedBounds(el);
      const x = b.x1 * scale + ox;
      const y = b.y1 * scale + oy;
      const w = Math.max(1, (b.x2 - b.x1) * scale);
      const h = Math.max(1, (b.y2 - b.y1) * scale);
      if (el.type === "text") ctx.fillRect(x, y + h * 0.3, w, Math.max(1, h * 0.4));
      else if (el.type === "frame") ctx.strokeRect(x, y, w, h);
      else {
        ctx.fillRect(x, y, w, h);
        ctx.strokeRect(x, y, w, h);
      }
    }
    ctx.strokeStyle = "#4f8ef7";
    ctx.fillStyle = "rgba(79,142,247,0.12)";
    ctx.lineWidth = 1.5;
    const vx = view.x1 * scale + ox;
    const vy = view.y1 * scale + oy;
    ctx.fillRect(vx, vy, (view.x2 - view.x1) * scale, (view.y2 - view.y1) * scale);
    ctx.strokeRect(vx, vy, (view.x2 - view.x1) * scale, (view.y2 - view.y1) * scale);
  }, [show, elements, viewport, theme]);

  if (!show) return null;

  const navigate = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const m = mapRef.current;
    if (!m) return;
    const r = e.currentTarget.getBoundingClientRect();
    const sx = (e.clientX - r.left - m.ox) / m.scale;
    const sy = (e.clientY - r.top - m.oy) / m.scale;
    const s = useStore.getState();
    const z = s.viewport.zoom;
    s.setViewport({ scrollX: window.innerWidth / 2 / z - sx, scrollY: window.innerHeight / 2 / z - sy });
  };

  return (
    <div className="minimap">
      <canvas
        ref={ref}
        style={{ width: W, height: H }}
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId);
          navigate(e);
        }}
        onPointerMove={(e) => e.buttons && navigate(e)}
      />
    </div>
  );
}

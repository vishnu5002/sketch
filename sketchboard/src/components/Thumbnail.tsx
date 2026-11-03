import { useEffect, useState } from "react";
import type { SketchElement } from "../types";
import { getCommonBounds } from "../utils/geometry";
import { renderElementsToCanvas } from "../utils/exportScene";

const cache = new WeakMap<SketchElement[], Map<string, string>>();

export default function Thumbnail({ elements, size = 120, dark = false }: { elements: SketchElement[]; size?: number; dark?: boolean }) {
  const key = `${size}:${dark}`;
  const [, setTick] = useState(0);
  const src = cache.get(elements)?.get(key) ?? null;

  useEffect(() => {
    if (cache.get(elements)?.has(key)) return;
    const b = getCommonBounds(elements);
    if (!b) return;
    let cancelled = false;
    const scale = Math.min(2, (size * 2) / Math.max(1, b.x2 - b.x1 + 20, b.y2 - b.y1 + 20));
    renderElementsToCanvas(elements, { background: null, scale, dark, padding: 10 }).then((c) => {
      if (!cache.has(elements)) cache.set(elements, new Map());
      cache.get(elements)!.set(key, c.toDataURL());
      if (!cancelled) setTick((t) => t + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [elements, key, size, dark]);

  return src ? <img src={src} alt="" draggable={false} /> : <div className="thumb-placeholder" />;
}

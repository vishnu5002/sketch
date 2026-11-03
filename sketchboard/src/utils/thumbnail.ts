import type { DocumentFile } from "../types";
import { renderElementsToCanvas } from "./exportScene";
import { getCommonBounds } from "./geometry";

/** Small preview of the active page, as a data URL (used by Home and version history). */
export async function thumbnail(doc: DocumentFile, maxW = 280, maxH = 180): Promise<string | undefined> {
  const page = doc.pages.find((p) => p.id === doc.activePageId) ?? doc.pages[0];
  const els = page?.elements ?? [];
  const b = getCommonBounds(els);
  if (!b) return undefined;
  const scale = Math.min(1, maxW / Math.max(1, b.x2 - b.x1 + 20), maxH / Math.max(1, b.y2 - b.y1 + 20));
  try {
    const canvas = await renderElementsToCanvas(els, { background: doc.canvasBg ?? "#ffffff", scale, dark: false, padding: 10 });
    return canvas.toDataURL("image/webp", 0.75);
  } catch {
    return undefined;
  }
}

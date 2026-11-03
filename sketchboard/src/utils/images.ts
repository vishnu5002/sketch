// Images live on the server as content-addressed blobs; elements point at /api/blobs/<hash>.
import { api, OfflineError } from "../api";
import type { DocumentFile, SketchElement } from "../types";

const uploaded = new Map<string, string>();
const inlined = new Map<string, string>();

const isData = (src: string | undefined): src is string => !!src && src.startsWith("data:");

/** Upload one data-URL image (once per distinct image) and return its server URL. */
export async function uploadDataUrl(dataUrl: string): Promise<string> {
  const known = uploaded.get(dataUrl);
  if (known) return known;
  const blob = await (await fetch(dataUrl)).blob();
  const { url } = await api<{ url: string }>("/api/blobs", { raw: blob });
  uploaded.set(dataUrl, url);
  return url;
}

/**
 * Replace embedded images in `doc` with server URLs. Returns the new doc and the
 * replacements made, so the caller can swap them into the live store too.
 * Offline uploads are left embedded; the server stores them on the next save.
 */
export async function externalizeImages(doc: DocumentFile): Promise<{ doc: DocumentFile; swaps: Map<string, string> }> {
  const swaps = new Map<string, string>();
  for (const p of doc.pages) {
    for (const e of p.elements) {
      if (e.type !== "image" || !isData(e.src) || swaps.has(e.src)) continue;
      try {
        swaps.set(e.src, await uploadDataUrl(e.src));
      } catch (err) {
        if (err instanceof OfflineError) return { doc, swaps };
        throw err;
      }
    }
  }
  if (!swaps.size) return { doc, swaps };
  const swap = (e: SketchElement) => (e.type === "image" && e.src && swaps.has(e.src) ? { ...e, src: swaps.get(e.src) } : e);
  return { doc: { ...doc, pages: doc.pages.map((p) => ({ ...p, elements: p.elements.map(swap) })) }, swaps };
}

/** A self-contained data URL for an image src (for SVG export and file export). */
export async function inlineSrc(src: string | undefined): Promise<string> {
  if (!src || src.startsWith("data:")) return src ?? "";
  const known = inlined.get(src);
  if (known) return known;
  const blob = await (await fetch(src)).blob();
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  inlined.set(src, data);
  return data;
}

export async function inlineImages(elements: SketchElement[]): Promise<SketchElement[]> {
  return Promise.all(elements.map(async (e) => (e.type === "image" && e.src && !isData(e.src) ? { ...e, src: await inlineSrc(e.src) } : e)));
}

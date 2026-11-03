import { livePages, refit, useStore } from "./store";
import { exitPreview } from "./utils/versions";
import type { ElementType, Point, SketchElement, TextLink } from "./types";
import { cloneElements } from "./utils/clone";
import { getCommonBounds } from "./utils/geometry";
import { makeId, randomSeed } from "./utils/id";
import { screenToScene } from "./utils/viewport";
import { getKnownEmbed, looksLikeUrl, sanitizeEmbedUrl, sanitizeLink } from "./utils/embed";
import { preloadImage } from "./utils/renderer";
import { elementLink, isInternalLink, localizeLink, otherDrawingOf, pageLink, resolveInternalLink } from "./utils/internalLinks";
import { drawingName } from "./linkNav";
import { copyPNGToClipboard, copySVGToClipboard, readImageFile } from "./utils/exportScene";
import { writeElementsToClipboard, type ClipboardPayload } from "./utils/clipboard";

const toast = (m: string) => useStore.getState().showToast(m);

export function viewportSize() {
  return { width: window.innerWidth, height: window.innerHeight };
}

export function sceneCenter(): Point {
  const { width, height } = viewportSize();
  return screenToScene({ x: width / 2, y: height / 2 }, useStore.getState().viewport);
}

export function selectedElements(): SketchElement[] {
  const s = useStore.getState();
  const ids = new Set(s.selectedIds);
  return s.elements.filter((e) => ids.has(e.id));
}

/** A new element carrying the current style defaults. */
export function newElement(type: ElementType, x: number, y: number, width = 0, height = 0, extra: Partial<SketchElement> = {}): SketchElement {
  const style = useStore.getState().style;
  return {
    id: makeId(),
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: style.strokeColor,
    backgroundColor: style.backgroundColor,
    fillStyle: style.fillStyle,
    strokeWidth: style.strokeWidth,
    strokeStyle: style.strokeStyle,
    roughness: style.roughness,
    roundness: style.roundness,
    opacity: style.opacity,
    seed: randomSeed(),
    groupId: null,
    ...extra,
  };
}

export function textElement(at: Point, text: string, extra: Partial<SketchElement> = {}): SketchElement {
  const style = useStore.getState().style;
  return refit(
    newElement("text", at.x, at.y, 10, 10, {
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeWidth: 1,
      strokeStyle: "solid",
      roughness: 0,
      roundness: false,
      text,
      fontFamily: style.fontFamily,
      fontSize: style.fontSize,
      textAlign: style.textAlign,
      fontWeight: style.fontWeight,
      fontStyle: style.fontStyle,
      textDecoration: style.textDecoration,
      ...extra,
    }),
  );
}

export function embedElement(at: Point, url: string | null, width = 560): SketchElement {
  const aspect = (url && getKnownEmbed(url)?.aspect) || 16 / 9;
  const w = aspect < 1 ? 560 * aspect : width;
  const h = aspect < 1 ? 560 : width / aspect;
  return newElement("embed", at.x - w / 2, at.y - h / 2, w, h, {
    link: url,
    backgroundColor: "transparent",
    strokeColor: "#1e1e1e",
    roughness: 0,
    strokeWidth: 1,
  });
}

export async function insertImageFile(file: File, at?: Point) {
  const dataUrl = await readImageFile(file);
  const img = await preloadImage(dataUrl);
  const p = at ?? sceneCenter();
  let w = img.naturalWidth || 200;
  let h = img.naturalHeight || 200;
  const maxDim = 520 / useStore.getState().viewport.zoom;
  if (w > maxDim || h > maxDim) {
    const k = maxDim / Math.max(w, h);
    w *= k;
    h *= k;
  }
  const el = newElement("image", p.x - w / 2, p.y - h / 2, w, h, {
    strokeColor: "transparent",
    backgroundColor: "transparent",
    roughness: 0,
    opacity: 100,
    src: dataUrl,
    naturalWidth: img.naturalWidth,
    naturalHeight: img.naturalHeight,
  });
  useStore.getState().insertElements([el]);
  useStore.getState().setTool("selection");
}

export async function pastePayload(payload: ClipboardPayload, at?: Point) {
  const s = useStore.getState();
  const p = at ?? sceneCenter();
  if (payload.files?.length) {
    for (const f of payload.files) await insertImageFile(f, p);
    return;
  }
  if (payload.elements?.length) {
    const b = getCommonBounds(payload.elements)!;
    const dx = p.x - (b.x1 + b.x2) / 2;
    const dy = p.y - (b.y1 + b.y2) / 2;
    // Cut then paste is a move: when none of the ids exist any more, keep them
    // so links pointing at these elements keep working.
    const existing = new Set(livePages().flatMap((pg) => pg.elements.map((e) => e.id)));
    if (payload.elements.every((e) => !existing.has(e.id))) {
      s.insertElements(payload.elements.map((e) => ({ ...e, x: e.x + dx, y: e.y + dy, points: e.points?.map((pt) => [pt[0], pt[1]] as [number, number]), locked: false })));
    } else {
      s.insertElements(cloneElements(payload.elements, dx, dy, { pageId: s.activePageId }));
    }
    return;
  }
  const text = payload.text?.replace(/\r\n/g, "\n");
  if (!text || !text.trim()) return;
  if (isInternalLink(text.trim())) {
    // a copied "link to this": paste it as text naming the place, linked there
    const link = localizeLink(text.trim(), s.project?.id);
    const other = otherDrawingOf(link);
    const target = other ? null : resolveInternalLink(link, livePages());
    const t = other ? (drawingName(other) ?? "Linked drawing") : target?.name;
    if (t) {
      s.insertElements([textElement(p, t, { textLinks: [{ start: 0, end: t.length, url: link }] })]);
      return;
    }
  }
  if (looksLikeUrl(text)) {
    const url = sanitizeEmbedUrl(text);
    if (url && getKnownEmbed(url)) {
      s.insertElements([embedElement(p, url)]);
      return;
    }
    const link = sanitizeLink(text);
    if (link) {
      const t = text.trim();
      s.insertElements([textElement(p, t, { textLinks: [{ start: 0, end: t.length, url: link }] })]);
      return;
    }
  }
  s.insertElements([textElement(p, text)]);
}

export function copySelection() {
  const els = selectedElements();
  if (els.length) writeElementsToClipboard(els);
}

export function cutSelection() {
  const s = useStore.getState();
  copySelection();
  const before = useStore.getState().toast;
  s.deleteElements(s.selectedIds);
  // a cut is usually a move, and pasting it back keeps its ids (see pastePayload)
  if (useStore.getState().toast !== before) toast("Cut — links to it will work again once you paste it");
}

export function zoomToBounds(els: SketchElement[], maxZoom = 1) {
  const s = useStore.getState();
  const { width, height } = viewportSize();
  const b = getCommonBounds(els);
  if (!b) {
    s.setViewport({ zoom: 1, scrollX: 0, scrollY: 0 });
    return;
  }
  const pad = 120;
  const zoom = Math.max(0.1, Math.min(maxZoom, (width - pad) / Math.max(1, b.x2 - b.x1), (height - pad) / Math.max(1, b.y2 - b.y1)));
  s.setViewport({ zoom, scrollX: width / 2 / zoom - (b.x1 + b.x2) / 2, scrollY: height / 2 / zoom - (b.y1 + b.y2) / 2 });
}

export function zoomToFit() {
  zoomToBounds(useStore.getState().elements, 1);
}

export function zoomToSelection() {
  const els = selectedElements();
  if (els.length) zoomToBounds(els, 3);
}

/** Zoom by `factor`, keeping the scene point under `screen` fixed (defaults to view center). */
export function zoomBy(factor: number, screen?: Point) {
  const s = useStore.getState();
  const { width, height } = viewportSize();
  const anchor = screen ?? { x: width / 2, y: height / 2 };
  const zoom = Math.min(10, Math.max(0.1, s.viewport.zoom * factor));
  const scene = screenToScene(anchor, s.viewport);
  s.setViewport({ zoom, scrollX: anchor.x / zoom - scene.x, scrollY: anchor.y / zoom - scene.y });
}

export function setZoom(zoom: number) {
  zoomBy(zoom / useStore.getState().viewport.zoom);
}

/** Bring an element (on any page) into view and select it. */
export function focusElement(id: string, pageId?: string) {
  const s = useStore.getState();
  if (pageId && pageId !== s.activePageId) s.switchPage(pageId);
  const st = useStore.getState();
  const el = st.elements.find((e) => e.id === id);
  if (!el) return;
  const { width, height } = viewportSize();
  const b = getCommonBounds([el])!;
  const fits = (b.x2 - b.x1) * st.viewport.zoom < width * 0.8 && (b.y2 - b.y1) * st.viewport.zoom < height * 0.8;
  if (fits) {
    st.setViewport({ scrollX: width / 2 / st.viewport.zoom - (b.x1 + b.x2) / 2, scrollY: height / 2 / st.viewport.zoom - (b.y1 + b.y2) / 2 });
  } else {
    zoomToBounds([el], 2);
  }
  st.setSelectedIds([id]);
}

export async function copyAsPNG(els = selectedElements().length ? selectedElements() : useStore.getState().elements) {
  if (!els.length) return;
  const s = useStore.getState();
  try {
    await copyPNGToClipboard(els, { background: s.canvasBg, scale: 2, dark: s.theme === "dark" });
    toast("Copied as PNG");
  } catch {
    toast("Your browser blocked image copying — use Export instead");
  }
}

export async function copyAsSVG(els = selectedElements().length ? selectedElements() : useStore.getState().elements) {
  if (!els.length) return;
  const s = useStore.getState();
  try {
    await copySVGToClipboard(els, { background: s.canvasBg, dark: s.theme === "dark" });
    toast("Copied as SVG");
  } catch {
    toast("Couldn't access the clipboard");
  }
}

export function addSelectionToLibrary() {
  const els = selectedElements();
  if (!els.length) return;
  useStore.getState().addLibraryItem(els);
  useStore.getState().setUI({ showLibrary: true });
  toast("Added to library");
}

// Web links open in a new tab; links into the drawing jump there (see linkNav.ts).
export { followLink as openLink } from "./linkNav";

export function toggleViewMode() {
  // finish any in-progress text edit first so it's committed, not abandoned
  if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  const s = useStore.getState();
  if (s.preview) {
    exitPreview();
    return;
  }
  s.toggleViewMode();
  toast(useStore.getState().viewMode ? "View mode — press Alt+R to edit again" : "Editing enabled");
}

/**
 * A linked table of contents: every page and the frames on it, one per line,
 * each line linking there. One text element, so it moves and restyles as one.
 */
export function insertContents(at?: Point) {
  const s = useStore.getState();
  const lines: { text: string; url: string | null }[] = [{ text: "Contents", url: null }];
  for (const page of livePages()) {
    lines.push({ text: page.name, url: pageLink(page.id) });
    const frames = page.elements.filter((e) => e.type === "frame" && e.name?.trim()).sort((a, b) => a.y - b.y || a.x - b.x);
    for (const f of frames) lines.push({ text: `    ${f.name!.trim()}`, url: elementLink(page.id, f.id) });
  }
  let text = "";
  const textLinks: TextLink[] = [];
  for (const l of lines) {
    if (text) text += "\n";
    const indent = l.text.length - l.text.trimStart().length;
    if (l.url) textLinks.push({ start: text.length + indent, end: text.length + l.text.length, url: l.url });
    text += l.text;
  }
  s.insertElements([textElement(at ?? sceneCenter(), text, { textLinks })]);
  toast(`Inserted contents: ${lines.length - 1} links`);
}

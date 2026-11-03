import { useCallback, useEffect, useRef, useState } from "react";
import { refit, snapshot, useStore, type HistoryEntry } from "../store";
import type { Bounds, Point, SketchElement, ToolType, Viewport } from "../types";
import {
  elementCenter,
  elementsIntersectRect,
  fromWorldPoints,
  getCommonBounds,
  getElementBounds,
  getPointsBounds,
  getRotatedBounds,
  getWorldPoints,
  hitTestElement,
  normalizeRect,
  pointInBounds,
  rectContainsRect,
  rotatePoint,
} from "../utils/geometry";
import {
  createRoughCanvas,
  frameLabelHeight,
  isTextContainer,
  measureText,
  renderScene,
  subscribeImageLoads,
  textLinkAt,
} from "../utils/renderer";
import { screenToScene } from "../utils/viewport";
import { computeBoundArrow, findBindTarget } from "../utils/binding";
import { assignFrames, frameChildren } from "../utils/frames";
import { snapBounds, snapPoint, snapToGrid, type Guide } from "../utils/snapping";
import { cloneElements } from "../utils/clone";
import { payloadFromEvent, serializeElements } from "../utils/clipboard";
import { looksLikeUrl } from "../utils/embed";
import {
  addSelectionToLibrary,
  copyAsPNG,
  embedElement,
  insertImageFile,
  newElement,
  openLink,
  pastePayload,
  textElement,
  zoomBy,
  zoomToFit,
  zoomToSelection,
  setZoom,
  toggleViewMode,
} from "../actions";
import { openDocument, saveDocument } from "../utils/fileActions";
import { onFontLoaded } from "../utils/fonts";
import { autoLink } from "../utils/textLinks";
import { exitPreview } from "../utils/versions";
import TextEditorOverlay from "./TextEditorOverlay";
import Overlays from "./Overlays";

type Interaction =
  | { type: "none" }
  | { type: "panning"; lastX: number; lastY: number; startX?: number; startY?: number; link?: string | null }
  | { type: "pinch"; startDist: number; startZoom: number; anchor: Point }
  | { type: "rubberBand" }
  | { type: "laser" }
  | { type: "drawShape"; id: string; startScene: Point; before: HistoryEntry; snapTargets: Bounds[] }
  | { type: "drawFree"; id: string; before: HistoryEntry }
  | { type: "drawLinear"; id: string; before: HistoryEntry; dragging: boolean; pointerDownScreen: Point }
  | {
      type: "moveSelection";
      before: HistoryEntry;
      startScene: Point;
      origins: Map<string, { x: number; y: number }>;
      originBounds: Bounds;
      snapTargets: Bounds[];
      dirty: boolean;
    }
  | {
      type: "resize";
      before: HistoryEntry;
      id: string;
      handle: string;
      origin: SketchElement;
      snapTargets: Bounds[];
      dirty: boolean;
    }
  | { type: "resizePoint"; before: HistoryEntry; id: string; pointIndex: number; dirty: boolean }
  | { type: "rotate"; before: HistoryEntry; id: string; center: Point; startAngle: number; originAngle: number; dirty: boolean }
  | { type: "erase"; before: HistoryEntry; erased: Set<string> };

const HIT = 8;
const SNAP_PX = 6;
const MIN_SIZE = 2;
const LASER_FADE_MS = 1000;
const ACCENT = "#4f8ef7";

const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement || (t instanceof HTMLElement && t.isContentEditable);

function frameLabelBounds(f: SketchElement, zoom: number): Bounds {
  const h = frameLabelHeight(zoom);
  const w = Math.min(f.width, ((f.name || "Frame").length * 7.5 + 8) / zoom);
  return { x1: f.x, y1: f.y - h - 4 / zoom, x2: f.x + w, y2: f.y - 2 / zoom };
}

export default function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const elements = useStore((s) => s.elements);
  const selectedIds = useStore((s) => s.selectedIds);
  const viewport = useStore((s) => s.viewport);
  const theme = useStore((s) => s.theme);
  const gridEnabled = useStore((s) => s.gridEnabled);
  const editingTextId = useStore((s) => s.editingTextId);
  const tool = useStore((s) => s.tool);
  const canvasBg = useStore((s) => s.canvasBg);
  const activeEmbedId = useStore((s) => s.activeEmbedId);
  const viewMode = useStore((s) => s.viewMode);
  const viewTool = useStore((s) => s.viewTool);

  const [canvasSize, setCanvasSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  const [rubberBand, setRubberBand] = useState<Bounds | null>(null);
  const [cursor, setCursor] = useState("default");
  const [guides, setGuides] = useState<Guide[]>([]);
  const [bindHighlightId, setBindHighlightId] = useState<string | null>(null);
  const [imageTick, setImageTick] = useState(0);
  const [spaceHeld, setSpaceHeld] = useState(false);
  const [hoverLink, setHoverLink] = useState<{ url: string; x: number; y: number } | null>(null);

  const interactionRef = useRef<Interaction>({ type: "none" });
  const multiDraftRef = useRef<string | null>(null);
  const multiDraftBeforeRef = useRef<HistoryEntry | null>(null);
  const spaceHeldRef = useRef(false);
  const textEditBeforeRef = useRef<HistoryEntry | null>(null);
  const pendingImagePosRef = useRef<Point | null>(null);
  const lastPointerSceneRef = useRef<Point | null>(null);
  const pointersRef = useRef(new Map<number, Point>());
  const laserRef = useRef<{ x: number; y: number; t: number }[]>([]);
  const laserRafRef = useRef<number | null>(null);

  // ---- sizing ----
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => setCanvasSize({ width: el.clientWidth, height: el.clientHeight }));
    observer.observe(el);
    setCanvasSize({ width: el.clientWidth, height: el.clientHeight });
    return () => observer.disconnect();
  }, []);

  useEffect(() => subscribeImageLoads(() => setImageTick((t) => t + 1)), []);
  useEffect(() => onFontLoaded(() => setImageTick((t) => t + 1)), []);

  const prepare = (canvas: HTMLCanvasElement | null) => {
    if (!canvas) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { width: w, height: h } = canvasSize;
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return ctx;
  };

  // ---- static scene (inverted by CSS in dark mode) ----
  const renderStatic = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = prepare(canvas);
    if (!ctx || !canvas) return;
    const { width: w, height: h } = canvasSize;
    ctx.fillStyle = canvasBg;
    ctx.fillRect(0, 0, w, h);
    if (gridEnabled) drawGrid(ctx, viewport, w, h);
    ctx.save();
    ctx.scale(viewport.zoom, viewport.zoom);
    ctx.translate(viewport.scrollX, viewport.scrollY);
    const editing = editingTextId ? elements.find((e) => e.id === editingTextId) : undefined;
    renderScene(ctx, elements, createRoughCanvas(canvas), {
      zoom: viewport.zoom,
      theme,
      skipIds: editing?.type === "text" ? new Set([editing.id]) : undefined,
      hiddenTextIds: editing && editing.type !== "text" ? new Set([editing.id]) : undefined,
    });
    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, viewport, theme, gridEnabled, editingTextId, canvasSize, canvasBg, imageTick]);

  // ---- interactive overlay (never filtered, so UI colors stay true in dark mode) ----
  const renderOverlay = useCallback(() => {
    const ctx = prepare(overlayRef.current);
    if (!ctx) return;
    const zoom = viewport.zoom;
    ctx.save();
    ctx.scale(zoom, zoom);
    ctx.translate(viewport.scrollX, viewport.scrollY);

    if (bindHighlightId) {
      const t = elements.find((e) => e.id === bindHighlightId);
      if (t) {
        ctx.save();
        const c = elementCenter(t);
        ctx.translate(c.x, c.y);
        ctx.rotate(t.angle);
        ctx.translate(-c.x, -c.y);
        const b = getElementBounds(t);
        const pad = 5 / zoom;
        ctx.strokeStyle = "rgba(79,142,247,0.55)";
        ctx.lineWidth = 4 / zoom;
        ctx.strokeRect(b.x1 - pad, b.y1 - pad, b.x2 - b.x1 + pad * 2, b.y2 - b.y1 + pad * 2);
        ctx.restore();
      }
    }

    if (viewMode) {
      // search results still get highlighted, but without editing handles
      for (const el of elements) if (selectedIds.includes(el.id)) drawOutline(ctx, el, zoom, false);
    } else {
      drawSelectionOverlay(ctx, elements, selectedIds, zoom, editingTextId, activeEmbedId);
    }

    if (guides.length) {
      ctx.save();
      ctx.strokeStyle = "#e64980";
      ctx.lineWidth = 1 / zoom;
      for (const g of guides) {
        ctx.beginPath();
        ctx.moveTo(g.x1, g.y1);
        ctx.lineTo(g.x2, g.y2);
        ctx.stroke();
        for (const [px, py] of [
          [g.x1, g.y1],
          [g.x2, g.y2],
        ]) {
          const s = 3 / zoom;
          ctx.beginPath();
          ctx.moveTo(px - s, py - s);
          ctx.lineTo(px + s, py + s);
          ctx.moveTo(px + s, py - s);
          ctx.lineTo(px - s, py + s);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    if (rubberBand) {
      ctx.save();
      ctx.strokeStyle = ACCENT;
      ctx.fillStyle = "rgba(79,142,247,0.08)";
      ctx.lineWidth = 1 / zoom;
      const x = Math.min(rubberBand.x1, rubberBand.x2);
      const y = Math.min(rubberBand.y1, rubberBand.y2);
      ctx.fillRect(x, y, Math.abs(rubberBand.x2 - rubberBand.x1), Math.abs(rubberBand.y2 - rubberBand.y1));
      ctx.strokeRect(x, y, Math.abs(rubberBand.x2 - rubberBand.x1), Math.abs(rubberBand.y2 - rubberBand.y1));
      ctx.restore();
    }

    const trail = laserRef.current;
    if (trail.length > 1) {
      const now = performance.now();
      ctx.save();
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.shadowColor = "rgba(255,40,40,0.8)";
      ctx.shadowBlur = 10;
      for (let i = 1; i < trail.length; i++) {
        const age = now - trail[i].t;
        const a = Math.max(0, 1 - age / LASER_FADE_MS);
        ctx.strokeStyle = `rgba(255,50,50,${a})`;
        ctx.lineWidth = (2 + 3 * a) / zoom;
        ctx.beginPath();
        ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
        ctx.lineTo(trail[i].x, trail[i].y);
        ctx.stroke();
      }
      ctx.restore();
    }
    ctx.restore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements, selectedIds, viewport, canvasSize, rubberBand, guides, bindHighlightId, editingTextId, activeEmbedId, viewMode]);

  const renderOverlayRef = useRef(renderOverlay);
  renderOverlayRef.current = renderOverlay;

  useEffect(() => renderStatic(), [renderStatic]);
  useEffect(() => renderOverlay(), [renderOverlay]);
  useEffect(() => {
    document.fonts?.ready?.then(() => setImageTick((t) => t + 1));
  }, []);

  const runLaserLoop = () => {
    if (laserRafRef.current !== null) return;
    const tick = () => {
      const now = performance.now();
      laserRef.current = laserRef.current.filter((p) => now - p.t < LASER_FADE_MS);
      renderOverlayRef.current();
      laserRafRef.current = laserRef.current.length ? requestAnimationFrame(tick) : null;
    };
    laserRafRef.current = requestAnimationFrame(tick);
  };

  // ---- helpers ----
  const getLocalScreen = (e: { clientX: number; clientY: number }): Point => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const sceneFromEvent = (e: { clientX: number; clientY: number }) => screenToScene(getLocalScreen(e), useStore.getState().viewport);

  const hitTest = (pt: Point, includeLocked = false): string | null => {
    const s = useStore.getState();
    const zoom = s.viewport.zoom;
    for (let i = s.elements.length - 1; i >= 0; i--) {
      const f = s.elements[i];
      if (f.type === "frame" && (includeLocked || !f.locked) && pointInBounds(pt, frameLabelBounds(f, zoom))) return f.id;
    }
    // Embeds are DOM iframes layered above the canvas, so they visually cover
    // everything — clicks must reach them first to match what the user sees.
    for (let i = s.elements.length - 1; i >= 0; i--) {
      const el = s.elements[i];
      if (el.type === "embed" && el.link && (includeLocked || !el.locked) && hitTestElement(pt, el, 0)) return el.id;
    }
    for (let i = s.elements.length - 1; i >= 0; i--) {
      const el = s.elements[i];
      if (el.locked && !includeLocked) continue;
      if (hitTestElement(pt, el, HIT / zoom)) return el.id;
    }
    return null;
  };

  const snapTargetsExcluding = (ids: Set<string>): Bounds[] => {
    const s = useStore.getState();
    return s.elements.filter((e) => !ids.has(e.id)).map(getRotatedBounds);
  };

  const snapActive = (e: { ctrlKey: boolean; metaKey: boolean }) => useStore.getState().snapEnabled && !(e.ctrlKey || e.metaKey);

  const snapScenePoint = (p: Point, targets: Bounds[], e: { ctrlKey: boolean; metaKey: boolean }): Point => {
    const s = useStore.getState();
    if (!snapActive(e)) {
      setGuides([]);
      return p;
    }
    if (s.gridEnabled) {
      setGuides([]);
      return { x: snapToGrid(p.x), y: snapToGrid(p.y) };
    }
    const r = snapPoint(p, targets, SNAP_PX / s.viewport.zoom);
    setGuides(r.guides);
    return r.point;
  };

  const reassignFrames = (ids?: Iterable<string>) => {
    const s = useStore.getState();
    s.replaceElements(assignFrames(s.elements, ids ? new Set(ids) : undefined));
  };

  const finishCreation = (id: string, before: HistoryEntry) => {
    const s = useStore.getState();
    const el = s.elements.find((e) => e.id === id);
    if (el?.type === "frame") reassignFrames();
    else reassignFrames([id]);
    s.commitSnapshot(before);
    s.setSelectedIds([id]);
    if (!s.lockTool) s.setTool("selection");
  };

  const bindEnds = (arrowId: string, ends: { start?: boolean; end?: boolean }) => {
    const s = useStore.getState();
    const el = s.elements.find((e) => e.id === arrowId);
    if (!el || el.type !== "arrow") return;
    const pts = getWorldPoints(el);
    if (pts.length < 2) return;
    const zoom = s.viewport.zoom;
    let startBinding = el.startBinding ?? null;
    let endBinding = el.endBinding ?? null;
    if (ends.start) {
      const t = findBindTarget(pts[0], s.elements, el.id, zoom);
      startBinding = t ? { elementId: t.id } : null;
    }
    if (ends.end) {
      const t = findBindTarget(pts[pts.length - 1], s.elements, el.id, zoom);
      endBinding = t ? { elementId: t.id } : null;
    }
    if (pts.length === 2 && startBinding && endBinding && startBinding.elementId === endBinding.elementId) endBinding = null;
    const byId = new Map(s.elements.map((e) => [e.id, e]));
    const patch = computeBoundArrow({ ...el, startBinding, endBinding }, byId) ?? {};
    s.updateElement(el.id, { startBinding, endBinding, ...patch });
  };

  const finalizeLinear = (id: string, before: HistoryEntry, overridePoints?: [number, number][]) => {
    const s = useStore.getState();
    const el = s.elements.find((e) => e.id === id);
    if (!el) return;
    const points = overridePoints ?? el.points ?? [];
    if (points.length < 2) {
      s.removeElementsNoHistory([id]);
      return;
    }
    const world = points.map(([x, y]) => ({ x: el.x + x, y: el.y + y }));
    s.updateElement(id, fromWorldPoints(world));
    bindEnds(id, { start: true, end: true });
    setBindHighlightId(null);
    finishCreation(id, before);
  };

  const finalizeMultiDraft = (mode: "dblclick" | "enter" | "escape") => {
    const id = multiDraftRef.current;
    if (!id) return;
    const before = multiDraftBeforeRef.current!;
    multiDraftRef.current = null;
    multiDraftBeforeRef.current = null;
    setBindHighlightId(null);
    if (mode === "escape") {
      useStore.getState().removeElementsNoHistory([id]);
      return;
    }
    const el = useStore.getState().elements.find((e) => e.id === id);
    const points = (el?.points ?? []).slice(0, mode === "dblclick" ? -2 : -1);
    if (points.length < 2) useStore.getState().removeElementsNoHistory([id]);
    else finalizeLinear(id, before, points);
  };

  const eraseAt = (pt: Point) => {
    const inter = interactionRef.current;
    if (inter.type !== "erase") return;
    const s = useStore.getState();
    const hits = s.elements.filter((el) => !el.locked && !inter.erased.has(el.id) && hitTestElement(pt, el, 8 / s.viewport.zoom));
    if (hits.length) {
      hits.forEach((h) => inter.erased.add(h.id));
      s.removeElementsNoHistory(hits.map((h) => h.id));
    }
  };

  const cancelInteraction = () => {
    const inter = interactionRef.current;
    const s = useStore.getState();
    switch (inter.type) {
      case "drawShape":
      case "drawFree":
      case "drawLinear":
        s.removeElementsNoHistory([inter.id]);
        break;
      case "moveSelection":
      case "resize":
      case "resizePoint":
      case "rotate":
        if (inter.dirty) s.replaceElements(inter.before.elements);
        break;
      case "erase":
        if (inter.erased.size) s.replaceElements(inter.before.elements);
        break;
    }
    if (multiDraftRef.current) finalizeMultiDraft("escape");
    setRubberBand(null);
    setGuides([]);
    setBindHighlightId(null);
    interactionRef.current = { type: "none" };
  };

  const hitTestHandles = (pt: Point): { id: string; handle: string } | null => {
    const s = useStore.getState();
    if (s.selectedIds.length !== 1) return null;
    const el = s.elements.find((e) => e.id === s.selectedIds[0]);
    if (!el || el.locked || el.id === s.editingTextId) return null;
    const zoom = s.viewport.zoom;
    const pad = 9 / zoom;
    const center = elementCenter(el);
    const { x1, y1, x2, y2 } = getElementBounds(el);

    if (el.type !== "frame") {
      const rot = rotatePoint({ x: (x1 + x2) / 2, y: y1 - 26 / zoom }, center, el.angle);
      if (Math.hypot(pt.x - rot.x, pt.y - rot.y) <= pad) return { id: el.id, handle: "rotate" };
    }

    if (el.type === "line" || el.type === "arrow") {
      const pts = getWorldPoints(el);
      for (let i = 0; i < pts.length; i++) {
        if (Math.hypot(pt.x - pts[i].x, pt.y - pts[i].y) <= pad) return { id: el.id, handle: `point:${i}` };
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const m = { x: (pts[i].x + pts[i + 1].x) / 2, y: (pts[i].y + pts[i + 1].y) / 2 };
        if (Math.hypot(pt.x - m.x, pt.y - m.y) <= pad) return { id: el.id, handle: `mid:${i}` };
      }
      return null;
    }

    if (Math.abs(el.angle) > 0.001) return null;
    const corners = [
      { pos: { x: x1, y: y1 }, handle: "nw" },
      { pos: { x: x2, y: y1 }, handle: "ne" },
      { pos: { x: x2, y: y2 }, handle: "se" },
      { pos: { x: x1, y: y2 }, handle: "sw" },
    ];
    const edges = [
      { pos: { x: (x1 + x2) / 2, y: y1 }, handle: "n" },
      { pos: { x: x2, y: (y1 + y2) / 2 }, handle: "e" },
      { pos: { x: (x1 + x2) / 2, y: y2 }, handle: "s" },
      { pos: { x: x1, y: (y1 + y2) / 2 }, handle: "w" },
    ];
    for (const h of el.type === "text" ? corners : [...corners, ...edges]) {
      if (Math.hypot(pt.x - h.pos.x, pt.y - h.pos.y) <= pad) return { id: el.id, handle: h.handle };
    }
    return null;
  };

  const applyResize = (inter: Extract<Interaction, { type: "resize" }>, p: Point, shiftKey: boolean) => {
    const o = inter.origin;
    const { handle } = inter;
    let x = o.x;
    let y = o.y;
    let x2 = o.x + o.width;
    let y2 = o.y + o.height;
    if (handle.includes("e")) x2 = p.x;
    if (handle.includes("w")) x = p.x;
    if (handle.includes("s")) y2 = p.y;
    if (handle.includes("n")) y = p.y;
    let w = x2 - x;
    let h = y2 - y;
    const lockAspect = o.type === "text" || (o.type === "image" ? !shiftKey : shiftKey);
    if (lockAspect && handle.length === 2 && o.width && o.height) {
      const ratio = Math.abs(o.height / o.width);
      const nh = Math.abs(w) * ratio * (h < 0 ? -1 : 1);
      if (handle.includes("n")) y = y2 - nh;
      else y2 = y + nh;
      h = y2 - y;
    }
    if (Math.abs(w) < MIN_SIZE) {
      w = MIN_SIZE * (w < 0 ? -1 : 1);
      if (handle.includes("w")) x = x2 - w;
    }
    if (Math.abs(h) < MIN_SIZE) {
      h = MIN_SIZE * (h < 0 ? -1 : 1);
      if (handle.includes("n")) y = y2 - h;
    }
    const patch: Partial<SketchElement> = { ...normalizeRect(x, y, w, h) };
    if (o.type === "text" && o.height) {
      const fontSize = Math.max(4, (o.fontSize ?? 20) * (Math.abs(h) / o.height));
      const m = measureText(o.text || " ", { ...o, fontSize });
      patch.fontSize = fontSize;
      patch.width = m.width;
      patch.height = m.height;
      if (handle.includes("w")) patch.x = o.x + o.width - m.width;
      if (handle.includes("n")) patch.y = o.y + o.height - m.height;
    }
    if (o.points && o.width && o.height) {
      const sx = w / o.width;
      const sy = h / o.height;
      const pts = o.points.map(([px, py]) => [px * sx, py * sy] as [number, number]);
      const b = getPointsBounds(pts);
      patch.points = pts.map(([px, py]) => [px - b.minX, py - b.minY]);
    }
    if (o.type === "image") {
      patch.flipX = w < 0 ? !o.flipX : o.flipX;
      patch.flipY = h < 0 ? !o.flipY : o.flipY;
    }
    useStore.getState().updateElement(inter.id, patch);
  };

  const startTextEditing = (pt: Point, existingId?: string) => {
    const s = useStore.getState();
    textEditBeforeRef.current = snapshot(s.elements, s.selectedIds);
    if (existingId) {
      const el = s.elements.find((e) => e.id === existingId);
      if (el && isTextContainer(el) && !el.fontFamily) {
        s.updateElement(el.id, {
          fontFamily: s.style.fontFamily,
          fontSize: s.style.fontSize,
          textAlign: "center",
          fontWeight: s.style.fontWeight,
          fontStyle: s.style.fontStyle,
          textDecoration: s.style.textDecoration,
        });
      }
      s.setEditingTextId(existingId);
      s.setSelectedIds([existingId]);
      return;
    }
    const el = textElement(pt, "");
    s.addElement(el);
    s.setEditingTextId(el.id);
    s.setSelectedIds([el.id]);
  };

  const finishTextEditing = () => {
    const s = useStore.getState();
    const id = s.editingTextId;
    if (!id) return;
    const el = s.elements.find((e) => e.id === id);
    const before = textEditBeforeRef.current;
    s.setEditingTextId(null);
    if (!el) return;
    if (el.type === "text" && (el.text ?? "").trim() === "") {
      s.removeElementsNoHistory([id]);
      return;
    }
    if (el.type !== "text" && (el.text ?? "").trim() === "" && el.text) s.updateElement(id, { text: "", textLinks: undefined });
    const links = autoLink(el.text ?? "", el.textLinks);
    if (links !== el.textLinks) s.updateElement(id, { textLinks: links });
    const prev = before?.elements.find((e) => e.id === id);
    const current = useStore.getState().elements.find((e) => e.id === id)!;
    const linksChanged = JSON.stringify(prev?.textLinks ?? null) !== JSON.stringify(current.textLinks ?? null);
    if (before && (!prev || prev.text !== current.text || linksChanged)) {
      if (el.type === "text" && !prev) reassignFrames([id]);
      s.commitSnapshot(before);
    }
    if (!s.lockTool && s.tool !== "selection") s.setTool("selection");
  };

  const createShapeAt = (tool: ToolType, pt: Point): SketchElement => {
    const s = useStore.getState();
    if (tool === "frame") {
      const n = s.elements.filter((e) => e.type === "frame").length + 1;
      return newElement("frame", pt.x, pt.y, 0, 0, { name: `Frame ${n}`, roughness: 0, strokeColor: "#a5a5a5", backgroundColor: "transparent" });
    }
    if (tool === "embed") return { ...embedElement(pt, null), x: pt.x, y: pt.y, width: 0, height: 0 };
    return newElement(tool as SketchElement["type"], pt.x, pt.y);
  };

  // ---- pointer handlers ----
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pointers = pointersRef.current;
    if (e.pointerType === "touch") {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        cancelInteraction();
        const [a, b] = [...pointers.values()];
        const s = useStore.getState();
        const rect = canvasRef.current!.getBoundingClientRect();
        const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
        interactionRef.current = {
          type: "pinch",
          startDist: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)),
          startZoom: s.viewport.zoom,
          anchor: screenToScene(mid, s.viewport),
        };
        return;
      }
      if (pointers.size > 2) return;
    }
    if (e.button === 2) return;
    setHoverLink(null);
    const s = useStore.getState();
    if (s.contextMenu) s.setUI({ contextMenu: null });
    if (s.activeEmbedId) s.setUI({ activeEmbedId: null });
    if (s.editingFrameId) s.setUI({ editingFrameId: null });
    try {
      canvasRef.current!.setPointerCapture(e.pointerId);
    } catch {
      // pointer already released (e.g. very fast tap) — capture is only a nicety
    }
    const pt = sceneFromEvent(e);
    const tool = s.viewMode ? (s.viewTool === "laser" ? "laser" : "pan") : s.tool;
    if (s.viewMode && s.selectedIds.length) s.setSelectedIds([]);

    if (tool === "pan" || e.button === 1 || spaceHeldRef.current) {
      // In view mode a click (press + release without dragging) on a link follows it.
      let link: string | null = null;
      if (s.viewMode) {
        const hit = hitTest(pt);
        const el = hit ? s.elements.find((x) => x.id === hit) : undefined;
        link = el && el.type !== "embed" ? (textLinkAt(el, pt) ?? el.link ?? null) : null;
      }
      interactionRef.current = { type: "panning", lastX: e.clientX, lastY: e.clientY, startX: e.clientX, startY: e.clientY, link };
      setCursor("grabbing");
      return;
    }

    if (tool === "laser") {
      laserRef.current.push({ ...pt, t: performance.now() });
      interactionRef.current = { type: "laser" };
      runLaserLoop();
      return;
    }

    if (tool === "eraser") {
      interactionRef.current = { type: "erase", before: snapshot(s.elements, s.selectedIds), erased: new Set() };
      eraseAt(pt);
      return;
    }

    if (tool === "text") {
      const hit = hitTest(pt);
      const hitEl = hit ? s.elements.find((x) => x.id === hit) : undefined;
      if (hitEl && (hitEl.type === "text" || isTextContainer(hitEl))) startTextEditing(pt, hitEl.id);
      else startTextEditing(pt);
      return;
    }

    if (tool === "sticky") {
      const before = snapshot(s.elements, s.selectedIds);
      const el = newElement("rectangle", pt.x - 100, pt.y - 70, 200, 140, {
        backgroundColor: "#ffec99",
        fillStyle: "solid",
        strokeColor: "#1e1e1e",
        strokeWidth: 1,
        strokeStyle: "solid",
        roughness: 0,
        roundness: true,
        fontFamily: s.style.fontFamily,
        fontSize: 20,
        textAlign: "left",
        verticalAlign: "top",
        text: "",
      });
      s.addElement(el);
      reassignFrames([el.id]);
      textEditBeforeRef.current = before;
      s.setEditingTextId(el.id);
      s.setSelectedIds([el.id]);
      return;
    }

    if (tool === "image") {
      pendingImagePosRef.current = pt;
      fileInputRef.current?.click();
      return;
    }

    if (tool === "rectangle" || tool === "diamond" || tool === "ellipse" || tool === "frame" || tool === "embed") {
      const before = snapshot(s.elements, s.selectedIds);
      const targets = snapTargetsExcluding(new Set());
      const start = snapScenePoint(pt, targets, e);
      const el = createShapeAt(tool, start);
      s.addElement(el);
      s.setSelectedIds([]);
      interactionRef.current = { type: "drawShape", id: el.id, startScene: start, before, snapTargets: targets };
      return;
    }

    if (tool === "draw") {
      const before = snapshot(s.elements, s.selectedIds);
      const el = newElement("draw", pt.x, pt.y, 0, 0, {
        backgroundColor: "transparent",
        fillStyle: "solid",
        strokeStyle: "solid",
        roundness: false,
        points: [[0, 0]],
        pressures: e.pointerType === "pen" ? [e.pressure] : undefined,
      });
      s.addElement(el);
      interactionRef.current = { type: "drawFree", id: el.id, before };
      return;
    }

    if (tool === "line" || tool === "arrow") {
      if (multiDraftRef.current) {
        const el = s.elements.find((x) => x.id === multiDraftRef.current)!;
        const rel: [number, number] = [pt.x - el.x, pt.y - el.y];
        const points = [...(el.points ?? [])];
        points[points.length - 1] = rel;
        points.push(rel);
        s.updateElement(el.id, { points });
        return;
      }
      const before = snapshot(s.elements, s.selectedIds);
      const el = newElement(tool, pt.x, pt.y, 0, 0, {
        backgroundColor: "transparent",
        points: [
          [0, 0],
          [0, 0],
        ],
        lineType: s.style.lineType,
        startArrowhead: tool === "arrow" ? s.style.startArrowhead : "none",
        endArrowhead: tool === "arrow" ? s.style.endArrowhead : "none",
      });
      s.addElement(el);
      interactionRef.current = { type: "drawLinear", id: el.id, before, dragging: false, pointerDownScreen: { x: e.clientX, y: e.clientY } };
      return;
    }

    // ---- selection tool ----
    const handleHit = hitTestHandles(pt);
    if (handleHit) {
      const before = snapshot(s.elements, s.selectedIds);
      const el = s.elements.find((x) => x.id === handleHit.id)!;
      if (handleHit.handle === "rotate") {
        const center = elementCenter(el);
        interactionRef.current = {
          type: "rotate",
          before,
          id: el.id,
          center,
          startAngle: Math.atan2(pt.y - center.y, pt.x - center.x),
          originAngle: el.angle,
          dirty: false,
        };
      } else if (handleHit.handle.startsWith("point:") || handleHit.handle.startsWith("mid:")) {
        let idx = parseInt(handleHit.handle.split(":")[1], 10);
        if (handleHit.handle.startsWith("mid:")) {
          const pts = [...(el.points ?? [])];
          const a = pts[idx];
          const b = pts[idx + 1];
          pts.splice(idx + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]);
          s.updateElement(el.id, { points: pts });
          idx += 1;
        } else if (el.type === "arrow") {
          const last = (el.points?.length ?? 1) - 1;
          if (idx === 0) s.updateElement(el.id, { startBinding: null });
          if (idx === last) s.updateElement(el.id, { endBinding: null });
        }
        interactionRef.current = { type: "resizePoint", before, id: el.id, pointIndex: idx, dirty: false };
      } else {
        interactionRef.current = {
          type: "resize",
          before,
          id: el.id,
          handle: handleHit.handle,
          origin: { ...el, points: el.points?.map((p) => [p[0], p[1]] as [number, number]) },
          snapTargets: snapTargetsExcluding(new Set([el.id])),
          dirty: false,
        };
      }
      return;
    }

    const hitId = hitTest(pt);
    if (hitId) {
      const el = s.elements.find((x) => x.id === hitId)!;
      const textUrl = textLinkAt(el, pt);
      if ((e.ctrlKey || e.metaKey) && (textUrl || el.link)) {
        openLink(textUrl ?? el.link);
        return;
      }
      let selection: string[];
      if (e.shiftKey) {
        selection = s.selectedIds.includes(hitId) ? s.selectedIds.filter((id) => id !== hitId) : [...s.selectedIds, hitId];
      } else if (s.selectedIds.includes(hitId)) {
        selection = s.selectedIds;
      } else {
        selection = el.groupId ? s.elements.filter((x) => x.groupId === el.groupId && !x.locked).map((x) => x.id) : [hitId];
      }
      const before = snapshot(s.elements, selection);
      if (e.altKey && selection.length) {
        // Alt-drag leaves the originals in place and drags fresh copies.
        const ids = new Set(selection);
        const copies = cloneElements(s.elements.filter((x) => ids.has(x.id)));
        s.replaceElements([...s.elements, ...copies]);
        selection = copies.map((c) => c.id);
      }
      s.setSelectedIds(selection);
      startMove(selection, pt, before);
      return;
    }

    if (!e.shiftKey) s.setSelectedIds([]);
    setRubberBand({ x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y });
    interactionRef.current = { type: "rubberBand" };
  };

  const startMove = (selection: string[], pt: Point, before: HistoryEntry) => {
    const s = useStore.getState();
    const moved = new Set(selection);
    const frameIds = new Set(s.elements.filter((x) => moved.has(x.id) && x.type === "frame").map((x) => x.id));
    frameChildren(s.elements, frameIds).forEach((c) => moved.add(c.id));
    // An arrow dragged away from what it's attached to should detach rather than snap back.
    const unbind: { id: string; patch: Partial<SketchElement> }[] = [];
    for (const x of s.elements) {
      if (!moved.has(x.id) || x.type !== "arrow") continue;
      const patch: Partial<SketchElement> = {};
      if (x.startBinding && !moved.has(x.startBinding.elementId)) patch.startBinding = null;
      if (x.endBinding && !moved.has(x.endBinding.elementId)) patch.endBinding = null;
      if (Object.keys(patch).length) unbind.push({ id: x.id, patch });
    }
    if (unbind.length) s.updateElements(unbind);
    const movedEls = useStore.getState().elements.filter((x) => moved.has(x.id));
    interactionRef.current = {
      type: "moveSelection",
      before,
      startScene: pt,
      origins: new Map(movedEls.map((x) => [x.id, { x: x.x, y: x.y }])),
      originBounds: getCommonBounds(movedEls.filter((x) => selection.includes(x.id))) ?? { x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y },
      snapTargets: snapTargetsExcluding(moved),
      dirty: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const pointers = pointersRef.current;
    if (e.pointerType === "touch" && pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const s = useStore.getState();
    const pt = sceneFromEvent(e);
    lastPointerSceneRef.current = pt;
    const inter = interactionRef.current;

    switch (inter.type) {
      case "pinch": {
        if (pointers.size < 2) return;
        const [a, b] = [...pointers.values()];
        const rect = canvasRef.current!.getBoundingClientRect();
        const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
        const zoom = Math.min(10, Math.max(0.1, (inter.startZoom * Math.hypot(a.x - b.x, a.y - b.y)) / inter.startDist));
        s.setViewport({ zoom, scrollX: mid.x / zoom - inter.anchor.x, scrollY: mid.y / zoom - inter.anchor.y });
        return;
      }
      case "panning": {
        const dx = e.clientX - inter.lastX;
        const dy = e.clientY - inter.lastY;
        inter.lastX = e.clientX;
        inter.lastY = e.clientY;
        s.setViewport({ scrollX: s.viewport.scrollX + dx / s.viewport.zoom, scrollY: s.viewport.scrollY + dy / s.viewport.zoom });
        return;
      }
      case "laser":
        laserRef.current.push({ ...pt, t: performance.now() });
        runLaserLoop();
        return;
      case "rubberBand":
        setRubberBand((r) => (r ? { ...r, x2: pt.x, y2: pt.y } : r));
        return;
      case "drawShape": {
        const p = snapScenePoint(pt, inter.snapTargets, e);
        let width = p.x - inter.startScene.x;
        let height = p.y - inter.startScene.y;
        if (e.shiftKey) {
          const m = Math.max(Math.abs(width), Math.abs(height));
          width = (width < 0 ? -1 : 1) * m;
          height = (height < 0 ? -1 : 1) * m;
        }
        s.updateElement(inter.id, { width, height });
        return;
      }
      case "drawFree": {
        const el = s.elements.find((x) => x.id === inter.id);
        if (!el) return;
        const patch: Partial<SketchElement> = { points: [...(el.points ?? []), [pt.x - el.x, pt.y - el.y]] };
        if (el.pressures) patch.pressures = [...el.pressures, e.pressure];
        s.updateElement(inter.id, patch);
        return;
      }
      case "drawLinear": {
        const el = s.elements.find((x) => x.id === inter.id);
        if (!el) return;
        const points = [...(el.points ?? [])];
        let end = pt;
        if (e.shiftKey) end = snapAngle({ x: el.x, y: el.y }, pt);
        points[points.length - 1] = [end.x - el.x, end.y - el.y];
        if (Math.hypot(e.clientX - inter.pointerDownScreen.x, e.clientY - inter.pointerDownScreen.y) > 4) inter.dragging = true;
        s.updateElement(inter.id, { points });
        if (el.type === "arrow") setBindHighlightId(findBindTarget(end, s.elements, el.id, s.viewport.zoom)?.id ?? null);
        return;
      }
      case "moveSelection": {
        let dx = pt.x - inter.startScene.x;
        let dy = pt.y - inter.startScene.y;
        if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) inter.dirty = true;
        if (e.shiftKey) {
          if (Math.abs(dx) > Math.abs(dy)) dy = 0;
          else dx = 0;
        }
        let g: Guide[] = [];
        if (snapActive(e)) {
          if (s.gridEnabled) {
            dx = snapToGrid(inter.originBounds.x1 + dx) - inter.originBounds.x1;
            dy = snapToGrid(inter.originBounds.y1 + dy) - inter.originBounds.y1;
          } else {
            const r = snapBounds(inter.originBounds, dx, dy, inter.snapTargets, SNAP_PX / s.viewport.zoom);
            dx = r.dx;
            dy = r.dy;
            g = r.guides;
          }
        }
        setGuides(g);
        s.updateElements(Array.from(inter.origins.entries()).map(([id, o]) => ({ id, patch: { x: o.x + dx, y: o.y + dy } })));
        return;
      }
      case "resize":
        inter.dirty = true;
        applyResize(inter, snapScenePoint(pt, inter.snapTargets, e), e.shiftKey);
        return;
      case "resizePoint": {
        inter.dirty = true;
        const el = s.elements.find((x) => x.id === inter.id);
        if (!el) return;
        const local = rotatePoint(pt, elementCenter(el), -el.angle);
        const points = [...(el.points ?? [])];
        points[inter.pointIndex] = [local.x - el.x, local.y - el.y];
        const b = getPointsBounds(points);
        s.updateElement(inter.id, { points, width: Math.max(1, b.maxX - b.minX), height: Math.max(1, b.maxY - b.minY) });
        const isEnd = inter.pointIndex === 0 || inter.pointIndex === points.length - 1;
        if (el.type === "arrow" && isEnd) setBindHighlightId(findBindTarget(pt, s.elements, el.id, s.viewport.zoom)?.id ?? null);
        return;
      }
      case "rotate": {
        inter.dirty = true;
        let angle = Math.atan2(pt.y - inter.center.y, pt.x - inter.center.x) - inter.startAngle + inter.originAngle;
        if (e.shiftKey) angle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12);
        s.updateElement(inter.id, { angle });
        return;
      }
      case "erase":
        eraseAt(pt);
        return;
      default: {
        if (s.viewMode) {
          const hit = s.viewTool === "pan" ? hitTest(pt) : null;
          const el = hit ? s.elements.find((x) => x.id === hit) : undefined;
          const url = el ? (textLinkAt(el, pt) ?? (el.type === "embed" ? null : el.link) ?? null) : null;
          setHoverLink(url ? { url, x: e.clientX, y: e.clientY } : null);
          setCursor(url ? "pointer" : "grab");
          return;
        }
        if (multiDraftRef.current) {
          const el = s.elements.find((x) => x.id === multiDraftRef.current);
          if (el) {
            const points = [...(el.points ?? [])];
            const prev = points.length > 1 ? { x: el.x + points[points.length - 2][0], y: el.y + points[points.length - 2][1] } : pt;
            const end = e.shiftKey ? snapAngle(prev, pt) : pt;
            points[points.length - 1] = [end.x - el.x, end.y - el.y];
            s.updateElement(el.id, { points });
            if (el.type === "arrow") setBindHighlightId(findBindTarget(end, s.elements, el.id, s.viewport.zoom)?.id ?? null);
          }
        }
        if (s.tool === "selection") {
          const h = hitTestHandles(pt);
          if (h) setCursor(cursorForHandle(h.handle));
          else {
            const hit = hitTest(pt);
            const hitEl = hit ? s.elements.find((x) => x.id === hit) : undefined;
            const url = hitEl ? textLinkAt(hitEl, pt) : null;
            setHoverLink(url ? { url, x: e.clientX, y: e.clientY } : null);
            setCursor(hitEl ? ((e.ctrlKey || e.metaKey) && (url || hitEl.link) ? "pointer" : "move") : "default");
          }
        }
      }
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    const s = useStore.getState();
    const inter = interactionRef.current;
    if (inter.type === "pinch") {
      if (pointersRef.current.size < 2) interactionRef.current = { type: "none" };
      return;
    }
    // Apply the release position too — the last move event can lag behind it.
    if (inter.type !== "none" && inter.type !== "panning") handlePointerMove(e);
    setGuides([]);

    switch (inter.type) {
      case "panning":
        setCursor("default");
        if (inter.link && Math.hypot(e.clientX - (inter.startX ?? 0), e.clientY - (inter.startY ?? 0)) < 5) openLink(inter.link);
        break;
      case "drawShape": {
        const el = s.elements.find((x) => x.id === inter.id);
        if (!el || (Math.abs(el.width) < MIN_SIZE && Math.abs(el.height) < MIN_SIZE)) {
          s.removeElementsNoHistory([inter.id]);
          if (el?.type === "embed") {
            // a plain click with the embed tool still creates a default-sized embed
            const emb = embedElement(inter.startScene, null);
            s.addElement(emb);
            finishCreation(emb.id, inter.before);
            s.setUI({ linkEditor: { elementId: emb.id, mode: "embed", isNew: true } });
          }
        } else {
          s.updateElement(inter.id, normalizeRect(el.x, el.y, el.width, el.height));
          finishCreation(inter.id, inter.before);
          if (el.type === "embed") s.setUI({ linkEditor: { elementId: el.id, mode: "embed", isNew: true } });
          if (el.type === "frame") s.setSelectedIds([inter.id]);
        }
        break;
      }
      case "drawFree": {
        const el = s.elements.find((x) => x.id === inter.id);
        const points = el?.points ?? [];
        if (!el || points.length < 2) {
          s.removeElementsNoHistory([inter.id]);
        } else {
          s.updateElement(inter.id, { ...fromWorldPoints(points.map(([x, y]) => ({ x: el.x + x, y: el.y + y }))) });
          finishCreation(inter.id, inter.before);
        }
        break;
      }
      case "drawLinear":
        if (inter.dragging) finalizeLinear(inter.id, inter.before);
        else {
          multiDraftRef.current = inter.id;
          multiDraftBeforeRef.current = inter.before;
        }
        break;
      case "moveSelection":
        if (inter.dirty) {
          const movedIds = [...inter.origins.keys()];
          const frameIds = new Set(s.elements.filter((x) => inter.origins.has(x.id) && x.type === "frame").map((x) => x.id));
          const boundArrows = s.elements
            .filter((x) => x.type === "arrow" && [x.startBinding, x.endBinding].some((b) => b && inter.origins.has(b.elementId)))
            .map((x) => x.id);
          reassignFrames([
            ...movedIds.filter((id) => {
              const x = s.elements.find((y) => y.id === id);
              return x && x.type !== "frame" && !(x.frameId && frameIds.has(x.frameId));
            }),
            ...boundArrows,
          ]);
          s.commitSnapshot(inter.before);
        } else if (s.elements.length > inter.before.elements.length) {
          // alt-click without dragging: drop the copies we made speculatively
          s.replaceElements(inter.before.elements);
          s.setSelectedIds(inter.before.selectedIds);
        }
        break;
      case "resize":
        if (inter.dirty) {
          const el = s.elements.find((x) => x.id === inter.id);
          if (el) s.updateElement(el.id, refit(el));
          const boundArrows = useStore
            .getState()
            .elements.filter((x) => x.type === "arrow" && [x.startBinding, x.endBinding].some((b) => b?.elementId === inter.id))
            .map((x) => x.id);
          reassignFrames(el?.type === "frame" ? undefined : [inter.id, ...boundArrows]);
          s.commitSnapshot(inter.before);
        }
        break;
      case "resizePoint":
        if (inter.dirty) {
          const el = s.elements.find((x) => x.id === inter.id);
          if (el) {
            s.updateElement(el.id, fromWorldPoints(getWorldPoints(el)));
            const last = (el.points?.length ?? 1) - 1;
            if (inter.pointIndex === 0) bindEnds(el.id, { start: true });
            if (inter.pointIndex === last) bindEnds(el.id, { end: true });
          }
          s.commitSnapshot(inter.before);
        }
        setBindHighlightId(null);
        break;
      case "rotate":
        if (inter.dirty) s.commitSnapshot(inter.before);
        break;
      case "erase":
        if (inter.erased.size) s.commitSnapshot(inter.before);
        break;
      case "rubberBand":
        setRubberBand((r) => {
          if (r) {
            const rect = { x1: Math.min(r.x1, r.x2), y1: Math.min(r.y1, r.y2), x2: Math.max(r.x1, r.x2), y2: Math.max(r.y1, r.y2) };
            if (rect.x2 - rect.x1 > 1 || rect.y2 - rect.y1 > 1) {
              const st = useStore.getState();
              const hits = st.elements.filter((x) => {
                if (x.locked) return false;
                if (x.type === "frame") return rectContainsRect(rect, getRotatedBounds(x));
                return elementsIntersectRect(x, rect);
              });
              const groupIds = new Set(hits.map((h) => h.groupId).filter(Boolean));
              const withGroups = st.elements.filter((x) => !x.locked && (hits.includes(x) || (x.groupId && groupIds.has(x.groupId))));
              st.setSelectedIds(Array.from(new Set([...st.selectedIds, ...withGroups.map((x) => x.id)])));
            }
          }
          return null;
        });
        break;
    }
    interactionRef.current = { type: "none" };
  };

  const handleDoubleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (useStore.getState().viewMode) return;
    if (multiDraftRef.current) {
      finalizeMultiDraft("dblclick");
      return;
    }
    const s = useStore.getState();
    if (s.tool !== "selection") return;
    const pt = sceneFromEvent(e);
    const hitId = hitTest(pt);
    const el = hitId ? s.elements.find((x) => x.id === hitId) : undefined;
    if (!el) {
      startTextEditing(pt);
      return;
    }
    if (el.type === "text" || isTextContainer(el)) startTextEditing(pt, el.id);
    else if (el.type === "frame") s.setUI({ editingFrameId: el.id });
    else if (el.type === "embed") {
      // drop the selection so its handles don't sit on top of the live page
      if (el.link) {
        s.setSelectedIds([]);
        s.setUI({ activeEmbedId: el.id });
      }
      else s.setUI({ linkEditor: { elementId: el.id, mode: "embed" } });
    }
  };

  const handleContextMenu = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    cancelInteraction();
    const s = useStore.getState();
    const pt = sceneFromEvent(e);
    if (s.viewMode) {
      s.setUI({ contextMenu: { x: e.clientX, y: e.clientY, scene: pt, targetId: null } });
      return;
    }
    const hitId = hitTest(pt, true);
    const el = hitId ? s.elements.find((x) => x.id === hitId) : undefined;
    if (el && !el.locked && !s.selectedIds.includes(el.id)) {
      s.setSelectedIds(el.groupId ? s.elements.filter((x) => x.groupId === el.groupId).map((x) => x.id) : [el.id]);
    }
    if (!el) s.setSelectedIds([]);
    s.setUI({ contextMenu: { x: e.clientX, y: e.clientY, scene: pt, targetId: el?.id ?? null } });
  };

  // ---- wheel (non-passive so preventDefault actually stops page scroll/zoom) ----
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    const s = useStore.getState();
    if (e.ctrlKey || e.metaKey) {
      zoomBy(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0025)), getLocalScreen(e));
    } else {
      const k = e.deltaMode === 1 ? 20 : 1;
      const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX;
      const dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY;
      s.setViewport({ scrollX: s.viewport.scrollX - (dx * k) / s.viewport.zoom, scrollY: s.viewport.scrollY - (dy * k) / s.viewport.zoom });
    }
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    return () => canvas.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  // ---- clipboard ----
  useEffect(() => {
    const selectedEls = () => {
      const s = useStore.getState();
      const ids = new Set(s.selectedIds);
      return s.elements.filter((x) => ids.has(x.id));
    };
    const onCopy = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target) || useStore.getState().editingTextId) return;
      const els = selectedEls();
      if (!els.length) return;
      e.preventDefault();
      e.clipboardData?.setData("text/plain", serializeElements(els));
    };
    const onCut = (e: ClipboardEvent) => {
      if (useStore.getState().viewMode) return;
      onCopy(e);
      const s = useStore.getState();
      if (!isTypingTarget(e.target) && !s.editingTextId && s.selectedIds.length) s.deleteElements(s.selectedIds);
    };
    const onPaste = (e: ClipboardEvent) => {
      if (isTypingTarget(e.target) || useStore.getState().editingTextId || useStore.getState().viewMode) return;
      e.preventDefault();
      pastePayload(payloadFromEvent(e), lastPointerSceneRef.current ?? undefined);
    };
    window.addEventListener("copy", onCopy);
    window.addEventListener("cut", onCut);
    window.addEventListener("paste", onPaste);
    return () => {
      window.removeEventListener("copy", onCopy);
      window.removeEventListener("cut", onCut);
      window.removeEventListener("paste", onPaste);
    };
  }, []);

  const handleDrop = (e: React.DragEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const s = useStore.getState();
    if (s.viewMode) return;
    const pt = sceneFromEvent(e);
    const libId = e.dataTransfer.getData("application/x-sketchboard-library");
    if (libId) {
      const item = s.library.find((i) => i.id === libId);
      if (item) pastePayload({ elements: item.elements }, pt);
      return;
    }
    const images = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith("image/"));
    if (images.length) {
      images.forEach((f, i) => insertImageFile(f, { x: pt.x + i * 30, y: pt.y + i * 30 }));
      return;
    }
    const uri = e.dataTransfer.getData("text/uri-list") || e.dataTransfer.getData("text/plain");
    if (uri && looksLikeUrl(uri.split("\n")[0])) pastePayload({ text: uri.split("\n")[0] }, pt);
    else if (uri) pastePayload({ text: uri }, pt);
  };

  // ---- keyboard ----
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      const s = useStore.getState();
      if (s.editingTextId) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      if (e.altKey && e.code === "KeyR") {
        e.preventDefault();
        toggleViewMode();
        return;
      }
      if (e.altKey && e.code === "KeyH") {
        e.preventDefault();
        s.setUI({ showVersions: !s.showVersions, showLibrary: false });
        return;
      }
      if (s.viewMode && handleViewModeKey(e)) return;

      if (e.key === " " && !mod) {
        if (!spaceHeldRef.current) {
          spaceHeldRef.current = true;
          setSpaceHeld(true);
        }
        e.preventDefault();
        return;
      }

      if (e.key === "Escape") {
        if (multiDraftRef.current) finalizeMultiDraft("escape");
        else if (interactionRef.current.type !== "none") cancelInteraction();
        else if (s.contextMenu) s.setUI({ contextMenu: null });
        else if (s.activeEmbedId) s.setUI({ activeEmbedId: null });
        else if (s.searchOpen) s.setUI({ searchOpen: false });
        else if (s.tool !== "selection") s.setTool("selection");
        else s.setSelectedIds([]);
        return;
      }
      if (e.key === "Enter") {
        if (multiDraftRef.current) {
          finalizeMultiDraft("enter");
          return;
        }
        if (s.selectedIds.length === 1) {
          const el = s.elements.find((x) => x.id === s.selectedIds[0]);
          if (el && (el.type === "text" || isTextContainer(el))) {
            e.preventDefault();
            startTextEditing(elementCenter(el), el.id);
          } else if (el?.type === "embed" && el.link) s.setUI({ activeEmbedId: el.id });
          else if (el?.type === "frame") s.setUI({ editingFrameId: el.id });
        }
        return;
      }

      if (mod) {
        if (key === "z") {
          e.preventDefault();
          if (e.shiftKey) s.redo();
          else s.undo();
        } else if (key === "y") {
          e.preventDefault();
          s.redo();
        } else if (key === "a") {
          e.preventDefault();
          s.selectAll();
        } else if (key === "d") {
          e.preventDefault();
          s.duplicateSelected();
        } else if (key === "g") {
          e.preventDefault();
          if (e.shiftKey) s.ungroupSelected();
          else s.groupSelected();
        } else if (key === "k") {
          e.preventDefault();
          if (s.selectedIds.length === 1) s.setUI({ linkEditor: { elementId: s.selectedIds[0], mode: "link" } });
        } else if (key === "f") {
          e.preventDefault();
          s.setUI({ searchOpen: true });
        } else if (key === "s") {
          e.preventDefault();
          saveDocument(e.shiftKey);
        } else if (key === "o") {
          e.preventDefault();
          openDocument();
        } else if (key === "e" && e.shiftKey) {
          e.preventDefault();
          s.setUI({ exportOpen: true });
        } else if (key === "l" && e.shiftKey) {
          e.preventDefault();
          s.toggleLock(s.selectedIds);
        } else if (key === "=" || key === "+") {
          e.preventDefault();
          zoomBy(1.2);
        } else if (key === "-") {
          e.preventDefault();
          zoomBy(1 / 1.2);
        } else if (key === "0") {
          e.preventDefault();
          setZoom(1);
        } else if (key === "'") {
          e.preventDefault();
          s.toggleGrid();
        } else if (e.code === "BracketRight") {
          e.preventDefault();
          if (e.shiftKey) s.bringToFront(s.selectedIds);
          else s.bringForward(s.selectedIds);
        } else if (e.code === "BracketLeft") {
          e.preventDefault();
          if (e.shiftKey) s.sendToBack(s.selectedIds);
          else s.sendBackward(s.selectedIds);
        }
        return;
      }

      if (e.altKey) {
        if (e.code === "KeyC" && e.shiftKey) {
          e.preventDefault();
          copyAsPNG();
        } else if (e.code === "Slash") {
          e.preventDefault();
          s.setUI({ showStats: !s.showStats });
        } else if (e.code === "KeyS") {
          e.preventDefault();
          s.toggleSnap();
          s.showToast(useStore.getState().snapEnabled ? "Snapping on" : "Snapping off");
        } else if (e.code === "KeyM") {
          e.preventDefault();
          s.setUI({ showMinimap: !s.showMinimap });
        } else if (e.code === "KeyL") {
          e.preventDefault();
          addSelectionToLibrary();
        }
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (s.selectedIds.length) {
          e.preventDefault();
          s.deleteElements(s.selectedIds);
        }
        return;
      }
      if (e.key.startsWith("Arrow")) {
        if (!s.selectedIds.length) return;
        e.preventDefault();
        const step = e.shiftKey ? 10 : 1;
        const dx = e.key === "ArrowLeft" ? -step : e.key === "ArrowRight" ? step : 0;
        const dy = e.key === "ArrowUp" ? -step : e.key === "ArrowDown" ? step : 0;
        const ids = new Set(s.selectedIds);
        const frameIds = new Set(s.elements.filter((x) => ids.has(x.id) && x.type === "frame").map((x) => x.id));
        frameChildren(s.elements, frameIds).forEach((c) => ids.add(c.id));
        s.patchSelected({});
        s.updateElements(s.elements.filter((x) => ids.has(x.id)).map((x) => ({ id: x.id, patch: { x: x.x + dx, y: x.y + dy } })));
        return;
      }
      if (e.shiftKey) {
        if (e.code === "Digit1") zoomToFit();
        else if (e.code === "Digit2") zoomToSelection();
        else if (e.code === "KeyH") s.flipSelected("x");
        else if (e.code === "KeyV") s.flipSelected("y");
        else if (e.key === "?") s.setUI({ helpOpen: true });
        return;
      }

      const toolKeys: Record<string, ToolType> = {
        v: "selection",
        "1": "selection",
        h: "pan",
        r: "rectangle",
        "2": "rectangle",
        d: "diamond",
        "3": "diamond",
        o: "ellipse",
        "4": "ellipse",
        a: "arrow",
        "5": "arrow",
        l: "line",
        "6": "line",
        p: "draw",
        "7": "draw",
        t: "text",
        "8": "text",
        "9": "image",
        e: "eraser",
        "0": "eraser",
        f: "frame",
        k: "laser",
        n: "sticky",
        w: "embed",
      };
      if (key === "q") s.toggleLockTool();
      else if (key === "?" || key === "/") {
        if (key === "?") s.setUI({ helpOpen: true });
      } else if (toolKeys[key]) {
        if (multiDraftRef.current) finalizeMultiDraft("enter");
        s.setTool(toolKeys[key]);
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        spaceHeldRef.current = false;
        setSpaceHeld(false);
      }
    };
    const onBlur = () => {
      spaceHeldRef.current = false;
      setSpaceHeld(false);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // switching tools mid multi-point line should commit what's drawn so far
  useEffect(() => {
    if (multiDraftRef.current && tool !== "line" && tool !== "arrow") finalizeMultiDraft("enter");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool]);

  const editingElement = editingTextId ? elements.find((e) => e.id === editingTextId) ?? null : null;

  return (
    <div ref={containerRef} className="canvas-container">
      <canvas
        ref={canvasRef}
        className="static-canvas"
        style={{ width: canvasSize.width, height: canvasSize.height, cursor: viewMode ? (spaceHeld ? "grab" : viewTool === "laser" ? "crosshair" : cursor === "default" || cursor === "move" ? "grab" : cursor) : cursorFor(tool, cursor, spaceHeld) }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={(e) => {
          pointersRef.current.delete(e.pointerId);
          cancelInteraction();
        }}
        onPointerLeave={() => {
          setCursor("default");
          setHoverLink(null);
        }}
        onDoubleClick={handleDoubleClick}
        onDrop={handleDrop}
        onDragOver={(e) => e.preventDefault()}
        onContextMenu={handleContextMenu}
      />
      <Overlays />
      {hoverLink && interactionRef.current.type === "none" && (
        <div className="text-link-tooltip" style={{ left: hoverLink.x + 12, top: hoverLink.y + 16 }}>
          <span>{hoverLink.url}</span>
          <kbd>{viewMode ? "Click to open" : `${navigator.platform.includes("Mac") ? "⌘" : "Ctrl"}+click to open`}</kbd>
        </div>
      )}
      <canvas ref={overlayRef} className="overlay-canvas" style={{ width: canvasSize.width, height: canvasSize.height }} />
      {editingElement && <TextEditorOverlay element={editingElement} viewport={viewport} theme={theme} onFinish={finishTextEditing} />}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) insertImageFile(file, pendingImagePosRef.current ?? undefined);
          pendingImagePosRef.current = null;
          e.target.value = "";
        }}
      />
    </div>
  );
}

/** Handle a key in view mode. Returns true when the key was consumed (or deliberately ignored). */
function handleViewModeKey(e: KeyboardEvent): boolean {
  const s = useStore.getState();
  const mod = e.ctrlKey || e.metaKey;
  const key = e.key.toLowerCase();
  if (e.key === " ") return false; // space-to-pan keeps working
  if (mod) {
    if (key === "=" || key === "+") zoomBy(1.2);
    else if (key === "-") zoomBy(1 / 1.2);
    else if (key === "0") setZoom(1);
    else if (key === "f") s.setUI({ searchOpen: true });
    else if (key === "e" && e.shiftKey) s.setUI({ exportOpen: true });
    else if (key === "s" || key === "o") return false;
    else return true;
    e.preventDefault();
    return true;
  }
  if (e.key === "Escape") {
    if (s.preview) exitPreview();
    else if (s.contextMenu) s.setUI({ contextMenu: null });
    else if (s.searchOpen) s.setUI({ searchOpen: false });
    else if (s.viewTool === "laser") s.setUI({ viewTool: "pan" });
    return true;
  }
  if (e.shiftKey && e.code === "Digit1") zoomToFit();
  else if (e.key === "?") s.setUI({ helpOpen: true });
  else if (key === "k") s.setUI({ viewTool: s.viewTool === "laser" ? "pan" : "laser" });
  else if (key === "h" || key === "v") s.setUI({ viewTool: "pan" });
  else if (e.key.startsWith("Arrow")) {
    const step = (e.shiftKey ? 200 : 60) / s.viewport.zoom;
    const dx = e.key === "ArrowLeft" ? step : e.key === "ArrowRight" ? -step : 0;
    const dy = e.key === "ArrowUp" ? step : e.key === "ArrowDown" ? -step : 0;
    s.setViewport({ scrollX: s.viewport.scrollX + dx, scrollY: s.viewport.scrollY + dy });
    e.preventDefault();
  }
  return true;
}

function snapAngle(origin: Point, p: Point): Point {
  const dx = p.x - origin.x;
  const dy = p.y - origin.y;
  const len = Math.hypot(dx, dy);
  const step = Math.PI / 12;
  const a = Math.round(Math.atan2(dy, dx) / step) * step;
  return { x: origin.x + Math.cos(a) * len, y: origin.y + Math.sin(a) * len };
}

function cursorForHandle(handle: string): string {
  if (handle === "rotate") return "grab";
  if (handle.startsWith("point:") || handle.startsWith("mid:")) return "crosshair";
  const map: Record<string, string> = {
    n: "ns-resize",
    s: "ns-resize",
    e: "ew-resize",
    w: "ew-resize",
    ne: "nesw-resize",
    sw: "nesw-resize",
    nw: "nwse-resize",
    se: "nwse-resize",
  };
  return map[handle] ?? "default";
}

function cursorFor(tool: string, hoverCursor: string, spaceHeld: boolean): string {
  if (hoverCursor === "grabbing") return "grabbing";
  if (spaceHeld || tool === "pan") return "grab";
  if (tool === "selection") return hoverCursor;
  if (tool === "text") return "text";
  if (tool === "eraser") return "cell";
  if (tool === "laser") return "crosshair";
  return "crosshair";
}

function drawGrid(ctx: CanvasRenderingContext2D, viewport: Viewport, w: number, h: number) {
  let step = 20;
  while (step * viewport.zoom < 12) step *= 5;
  const tl = screenToScene({ x: 0, y: 0 }, viewport);
  const br = screenToScene({ x: w, y: h }, viewport);
  ctx.save();
  ctx.scale(viewport.zoom, viewport.zoom);
  ctx.translate(viewport.scrollX, viewport.scrollY);
  ctx.fillStyle = "#cfcfcf";
  const r = 1.1 / viewport.zoom;
  for (let x = Math.floor(tl.x / step) * step; x < br.x; x += step) {
    for (let y = Math.floor(tl.y / step) * step; y < br.y; y += step) {
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }
  ctx.restore();
}

function drawSelectionOverlay(
  ctx: CanvasRenderingContext2D,
  elements: SketchElement[],
  selectedIds: string[],
  zoom: number,
  editingTextId: string | null,
  activeEmbedId: string | null,
) {
  if (activeEmbedId) {
    const el = elements.find((e) => e.id === activeEmbedId);
    if (el) {
      ctx.save();
      const c = elementCenter(el);
      ctx.translate(c.x, c.y);
      ctx.rotate(el.angle);
      ctx.translate(-c.x, -c.y);
      ctx.strokeStyle = ACCENT;
      ctx.lineWidth = 3 / zoom;
      ctx.strokeRect(el.x - 2 / zoom, el.y - 2 / zoom, el.width + 4 / zoom, el.height + 4 / zoom);
      ctx.restore();
    }
  }
  if (selectedIds.length === 0) return;
  const ids = new Set(selectedIds);
  const selected = elements.filter((e) => ids.has(e.id));
  if (!selected.length) return;

  if (selected.length > 1) {
    const b = getCommonBounds(selected)!;
    const pad = 4 / zoom;
    ctx.save();
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([5 / zoom, 4 / zoom]);
    ctx.strokeRect(b.x1 - pad, b.y1 - pad, b.x2 - b.x1 + pad * 2, b.y2 - b.y1 + pad * 2);
    ctx.restore();
    for (const el of selected) drawOutline(ctx, el, zoom, false);
    return;
  }
  if (selected[0].id === editingTextId) return;
  drawOutline(ctx, selected[0], zoom, true);
}

function drawOutline(ctx: CanvasRenderingContext2D, el: SketchElement, zoom: number, showHandles: boolean) {
  const center = elementCenter(el);
  const { x1, y1, x2, y2 } = getElementBounds(el);
  const pad = el.type === "frame" ? 0 : 4 / zoom;
  const handleSize = 8 / zoom;
  ctx.save();
  ctx.translate(center.x, center.y);
  ctx.rotate(el.angle);
  ctx.translate(-center.x, -center.y);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 1 / zoom;

  if (el.type === "line" || el.type === "arrow") {
    if (showHandles && !el.locked) {
      const pts = el.points ?? [];
      ctx.fillStyle = "#ffffff";
      for (let i = 0; i < pts.length - 1; i++) {
        const mx = el.x + (pts[i][0] + pts[i + 1][0]) / 2;
        const my = el.y + (pts[i][1] + pts[i + 1][1]) / 2;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.arc(mx, my, handleSize / 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      for (const [px, py] of pts) {
        ctx.beginPath();
        ctx.arc(el.x + px, el.y + py, handleSize / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
    } else {
      ctx.setLineDash([5 / zoom, 4 / zoom]);
      ctx.strokeRect(x1 - pad, y1 - pad, x2 - x1 + pad * 2, y2 - y1 + pad * 2);
    }
    ctx.restore();
    return;
  }

  ctx.setLineDash(el.type === "frame" ? [] : [5 / zoom, 4 / zoom]);
  if (el.type === "frame") ctx.lineWidth = 2 / zoom;
  ctx.strokeRect(x1 - pad, y1 - pad, x2 - x1 + pad * 2, y2 - y1 + pad * 2);

  if (showHandles && !el.locked) {
    ctx.setLineDash([]);
    ctx.fillStyle = "#ffffff";
    if (Math.abs(el.angle) < 0.001) {
      const corners = [
        [x1 - pad, y1 - pad],
        [x2 + pad, y1 - pad],
        [x2 + pad, y2 + pad],
        [x1 - pad, y2 + pad],
      ];
      const edges = [
        [(x1 + x2) / 2, y1 - pad],
        [x2 + pad, (y1 + y2) / 2],
        [(x1 + x2) / 2, y2 + pad],
        [x1 - pad, (y1 + y2) / 2],
      ];
      for (const [px, py] of el.type === "text" ? corners : [...corners, ...edges]) {
        ctx.beginPath();
        if (ctx.roundRect) ctx.roundRect(px - handleSize / 2, py - handleSize / 2, handleSize, handleSize, 2 / zoom);
        else ctx.rect(px - handleSize / 2, py - handleSize / 2, handleSize, handleSize);
        ctx.fill();
        ctx.stroke();
      }
    }
    if (el.type !== "frame") {
      const rh = { x: (x1 + x2) / 2, y: y1 - 26 / zoom };
      ctx.beginPath();
      ctx.arc(rh.x, rh.y, handleSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }
  ctx.restore();
}

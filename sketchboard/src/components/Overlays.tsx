import { useEffect, useMemo, useRef } from "react";
import { CornerDownRight, ExternalLink } from "lucide-react";
import { useStore } from "../store";
import type { SketchElement, Viewport } from "../types";
import { getRotatedBounds } from "../utils/geometry";
import { sceneToScreen } from "../utils/viewport";
import { getEmbedSrc, hostOf, sanitizeEmbedUrl } from "../utils/embed";
import { openLink } from "../actions";
import { linkTitle } from "../linkNav";
import { isInternalLink, otherDrawingOf, resolveInternalLink } from "../utils/internalLinks";

function EmbedFrame({ el, viewport, active, live }: { el: SketchElement; viewport: Viewport; active: boolean; live: boolean }) {
  const src = el.link ? sanitizeEmbedUrl(el.link) : null;
  if (!src) return null;
  const p = sceneToScreen({ x: el.x, y: el.y }, viewport);
  return (
    <div
      className={`embed-wrap ${active ? "active" : ""}`}
      style={{
        left: p.x,
        top: p.y,
        width: el.width * viewport.zoom,
        height: el.height * viewport.zoom,
        transform: el.angle ? `rotate(${el.angle}rad)` : undefined,
        opacity: el.opacity / 100,
        // view mode makes every embed directly usable; in edit mode it takes a double-click
        pointerEvents: active || live ? "auto" : "none",
      }}
    >
      <iframe
        title={hostOf(el.link)}
        src={getEmbedSrc(src)}
        style={{ width: el.width, height: el.height, transform: `scale(${viewport.zoom})` }}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
        allowFullScreen
        sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-forms allow-presentation"
      />
    </div>
  );
}

function FrameNameInput({ frame, viewport }: { frame: SketchElement; viewport: Viewport }) {
  const ref = useRef<HTMLInputElement>(null);
  const before = useRef(frame.name);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  const p = sceneToScreen({ x: frame.x, y: frame.y }, viewport);
  const done = (commit: boolean) => {
    const s = useStore.getState();
    const name = ref.current?.value.trim();
    s.setUI({ editingFrameId: null });
    if (commit && name && name !== before.current) {
      s.setSelectedIds([frame.id]);
      s.patchSelected({ name });
    }
  };
  return (
    <input
      ref={ref}
      className="frame-name-input"
      defaultValue={frame.name}
      style={{ left: p.x, top: p.y - 26, width: Math.max(120, Math.min(frame.width * viewport.zoom, 320)) }}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Enter") done(true);
        if (e.key === "Escape") done(false);
      }}
      onBlur={() => done(true)}
    />
  );
}

/**
 * Holding Ctrl/⌘ on its own shows every link badge. The short delay keeps
 * shortcuts like Ctrl+Z from flashing them.
 */
function useRevealLinksKey() {
  useEffect(() => {
    let timer: number | undefined;
    const set = (revealLinks: boolean) => {
      clearTimeout(timer);
      if (useStore.getState().revealLinks !== revealLinks) useStore.setState({ revealLinks });
    };
    const down = (e: KeyboardEvent) => {
      if ((e.key === "Control" || e.key === "Meta") && !e.repeat) {
        clearTimeout(timer);
        timer = window.setTimeout(() => useStore.setState({ revealLinks: true }), 200);
      } else if (e.key !== "Control" && e.key !== "Meta") set(false);
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Control" || e.key === "Meta") set(false);
    };
    const off = () => set(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", off);
    window.addEventListener("wheel", off, { passive: true });
    return () => {
      off();
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", off);
      window.removeEventListener("wheel", off);
    };
  }, []);
}

export default function Overlays() {
  const elements = useStore((s) => s.elements);
  const viewport = useStore((s) => s.viewport);
  const activeEmbedId = useStore((s) => s.activeEmbedId);
  const editingFrameId = useStore((s) => s.editingFrameId);
  const editingTextId = useStore((s) => s.editingTextId);
  const viewMode = useStore((s) => s.viewMode);
  // every page's current elements, for checking internal links still have a target
  const storedPages = useStore((s) => s.pages);
  const activePageId = useStore((s) => s.activePageId);
  const pages = useMemo(() => storedPages.map((p) => (p.id === activePageId ? { ...p, elements } : p)), [storedPages, activePageId, elements]);
  // Links inside the app stay out of the way: their badge shows on hover, on
  // selection, while Ctrl/⌘ is held, or always if the user asked for that.
  const alwaysShowAppLinks = useStore((s) => s.alwaysShowAppLinks);
  const revealLinks = useStore((s) => s.revealLinks);
  const hoverElementId = useStore((s) => s.hoverElementId);
  const selectedIds = useStore((s) => s.selectedIds);
  const shownIds = useMemo(() => {
    const ids = new Set(selectedIds);
    if (hoverElementId) ids.add(hoverElementId);
    const groups = new Set(elements.filter((e) => ids.has(e.id) && e.groupId).map((e) => e.groupId));
    for (const e of elements) if (e.groupId && groups.has(e.groupId)) ids.add(e.id);
    return ids;
  }, [elements, selectedIds, hoverElementId]);
  useRevealLinksKey();

  const editingFrame = editingFrameId ? elements.find((e) => e.id === editingFrameId) : undefined;

  return (
    <div className="overlay-layer">
      {elements
        .filter((e) => e.type === "embed")
        .map((el) => (
          <EmbedFrame key={el.id} el={el} viewport={viewport} active={el.id === activeEmbedId} live={viewMode} />
        ))}
      {elements
        .filter((e) => e.link && e.type !== "embed" && e.id !== editingTextId)
        .map((el) => {
          const b = getRotatedBounds(el);
          const internal = isInternalLink(el.link);
          // web-link badges sit above the top-right corner; in-app ones beside it,
          // level with a short element (like a row) so it's clear which one they belong to
          const p = sceneToScreen({ x: b.x2, y: b.y1 + (internal ? Math.min((b.y2 - b.y1) / 2, 14) : 0) }, viewport);
          const missing = internal && !otherDrawingOf(el.link) && !resolveInternalLink(el.link, pages);
          // broken links stay visible while editing, since they need fixing
          const quiet = internal && !(missing && !viewMode) && !alwaysShowAppLinks && !revealLinks && !shownIds.has(el.id);
          return (
            <button
              key={el.id}
              className={`link-badge ${internal ? "internal" : ""} ${missing ? "missing" : ""} ${quiet ? "quiet" : ""}`}
              style={{ left: p.x + 4, top: internal ? p.y - 9 : p.y - 22 }}
              title={missing && !viewMode ? "The linked page or element no longer exists — click to choose a new target" : linkTitle(el.link)}
              onPointerDown={(e) => e.stopPropagation()}
              // a quiet badge is still there, so pointing at it shows it
              onPointerEnter={() => useStore.setState({ hoverElementId: el.id })}
              onPointerLeave={() => useStore.setState({ hoverElementId: null })}
              onClick={() => (missing && !viewMode ? useStore.getState().setUI({ linkEditor: { elementId: el.id, mode: "link" } }) : openLink(el.link))}
            >
              {internal ? <CornerDownRight size={12} /> : <ExternalLink size={12} />}
            </button>
          );
        })}
      {elements
        .filter((e) => e.type === "embed" && e.link && e.id !== activeEmbedId)
        .map((el) => {
          const p = sceneToScreen({ x: el.x + el.width, y: el.y }, viewport);
          if (el.angle) return null;
          return (
            <button
              key={"open-" + el.id}
              className="link-badge"
              style={{ left: p.x - 24, top: p.y - 26 }}
              title={`Open ${hostOf(el.link)} in a new tab`}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => openLink(el.link)}
            >
              <ExternalLink size={12} />
            </button>
          );
        })}
      {editingFrame && <FrameNameInput frame={editingFrame} viewport={viewport} />}
    </div>
  );
}

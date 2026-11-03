// Following links: web links open in a new tab, links into the drawing jump
// there. Each jump adds a browser history entry holding the view it left, so
// browser Back, Alt+← and the Back chip all return to exactly that spot.
import { livePages, useStore, type LinkPickState } from "./store";
import type { SketchElement, Viewport } from "./types";
import { sanitizeLink } from "./utils/embed";
import { elementLink, isInternalLink, pageLink, resolveInternalLink, type ResolvedTarget } from "./utils/internalLinks";
import { setLinkRange } from "./utils/textLinks";
import { zoomToBounds } from "./actions";

interface NavEntry {
  sbNav: true;
  projectId: string;
  pageId: string;
  viewport: Viewport;
  index: number;
}

const st = () => useStore.getState();

/** Page names of the places each history entry was left from, by entry index. */
const trail: string[] = [];

function navState(): NavEntry | null {
  const h = history.state as NavEntry | null;
  return h?.sbNav && h.projectId === st().project?.id ? h : null;
}

function here(index: number): NavEntry | null {
  const s = st();
  if (!s.project) return null;
  return { sbNav: true, projectId: s.project.id, pageId: s.activePageId, viewport: s.viewport, index };
}

/** What to show for a link: its address, or "↪ Page › element" for one into this drawing. */
export function linkTitle(link: string | null | undefined): string {
  if (!link) return "";
  if (!isInternalLink(link)) return link;
  const t = resolveInternalLink(link, livePages());
  return t ? `↪ ${t.label}` : "↪ Missing target (deleted?)";
}

export function followLink(link: string | null | undefined) {
  if (isInternalLink(link)) {
    goToInternal(link);
    return;
  }
  const safe = link ? sanitizeLink(link) : null;
  if (safe) window.open(safe, "_blank", "noopener,noreferrer");
}

export function goToInternal(link: string) {
  const target = resolveInternalLink(link, livePages());
  if (!target) {
    st().showToast("That link's target no longer exists");
    return;
  }
  const s = st();
  const index = navState()?.index ?? 0;
  const from = here(index);
  if (from) {
    history.replaceState(from, "", location.href);
    trail[index] = s.pages.find((p) => p.id === s.activePageId)?.name ?? "previous view";
    trail.length = index + 1;
  }
  showTarget(target);
  const to = here(index + 1);
  if (to) history.pushState(to, "", location.href);
  useStore.setState({ navBack: trail[index] ?? null, contextMenu: null });
}

/** Switch to the target's page and fit it (an element with its group) in view, selected. */
function showTarget(t: ResolvedTarget) {
  const s = st();
  if (t.page.id !== s.activePageId) s.switchPage(t.page.id);
  const els = st().elements;
  let focus: SketchElement[] = els;
  if (t.element) {
    const el = els.find((e) => e.id === t.element!.id) ?? t.element;
    focus = el.groupId ? els.filter((e) => e.groupId === el.groupId) : [el];
  }
  zoomToBounds(focus, 1);
  st().setSelectedIds(t.element ? focus.map((e) => e.id) : []);
}

/** Back to where the last link was followed from. Returns false when there's nothing to go back to. */
export function navigateBack(): boolean {
  const n = navState();
  if (!n || n.index === 0) return false;
  history.back();
  return true;
}

let listening = false;

export function startLinkNav() {
  if (listening) return;
  listening = true;
  window.addEventListener("popstate", (e) => {
    const n = e.state as NavEntry | null;
    if (!n?.sbNav || n.projectId !== st().project?.id) {
      useStore.setState({ navBack: null });
      return;
    }
    const s = st();
    if (n.pageId !== s.activePageId && s.pages.some((p) => p.id === n.pageId)) s.switchPage(n.pageId);
    st().setViewport(n.viewport);
    st().setSelectedIds([]);
    useStore.setState({ navBack: n.index > 0 ? (trail[n.index - 1] ?? "previous view") : null });
  });
  // Leaving the drawing ends its trail.
  useStore.subscribe((s, prev) => {
    if (s.project?.id !== prev.project?.id && s.navBack) useStore.setState({ navBack: null });
  });
}

/** Put a link to an element (or, with none, the current page) on the clipboard. */
export async function copyLinkTo(elementId?: string) {
  const s = st();
  const link = elementId ? elementLink(s.activePageId, elementId) : pageLink(s.activePageId);
  try {
    await navigator.clipboard.writeText(link);
    s.showToast(`Copied link to ${resolveInternalLink(link, livePages())?.label ?? "this"} — paste it into any link box`);
  } catch {
    s.showToast("Couldn't copy to the clipboard");
  }
}

// ---------- picking a target on the canvas ----------

/** Start choosing a link target for `elementId` (or a text range in it) by clicking. */
export function startLinkPick(elementId: string, range?: [number, number]) {
  const s = st();
  const pick: LinkPickState = { pageId: s.activePageId, elementId, range, viewport: s.viewport };
  useStore.setState({ linkPick: pick, linkEditor: null, contextMenu: null });
  s.setSelectedIds([]);
}

/** Link to the clicked element on the current page (null: the page itself). */
export function pickHere(elementId: string | null) {
  const s = st();
  finishLinkPick(elementId ? elementLink(s.activePageId, elementId) : pageLink(s.activePageId));
}

/** Apply the chosen link (or cancel with null) and return to the element being linked. */
export function finishLinkPick(link: string | null) {
  const pick = st().linkPick;
  if (!pick) return;
  useStore.setState({ linkPick: null });
  if (pick.pageId !== st().activePageId) st().switchPage(pick.pageId);
  st().setViewport(pick.viewport);
  const el = st().elements.find((e) => e.id === pick.elementId);
  if (!el || !link) return;
  st().setSelectedIds([el.id]);
  if (pick.range) st().patchSelected({ textLinks: setLinkRange(el.textLinks, pick.range[0], pick.range[1], link) });
  else st().setLink(el.id, link);
  const label = resolveInternalLink(link, livePages())?.label;
  if (label) st().showToast(`Linked to ${label}`);
}

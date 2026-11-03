import type { Page, SketchElement } from "../types";

/**
 * Links to places inside the open drawing, stored in the same `link` /
 * `textLinks[].url` fields as web links:
 *
 *   sketchboard:page/<pageId>
 *   sketchboard:el/<pageId>/<elementId>
 *
 * Ids are stable across saves, so these survive reloads and exports.
 */
export type InternalTarget = { kind: "page"; pageId: string } | { kind: "el"; pageId: string; elementId: string };

const PREFIX = "sketchboard:";
const ID = "[\\w-]{1,64}";
const PAGE_RE = new RegExp(`^${PREFIX}page/(${ID})$`);
const EL_RE = new RegExp(`^${PREFIX}el/(${ID})/(${ID})$`);

export function isInternalLink(link: string | null | undefined): link is string {
  return !!link && link.startsWith(PREFIX);
}

export function parseInternalLink(link: string | null | undefined): InternalTarget | null {
  if (!link) return null;
  const s = link.trim();
  let m = PAGE_RE.exec(s);
  if (m) return { kind: "page", pageId: m[1] };
  m = EL_RE.exec(s);
  if (m) return { kind: "el", pageId: m[1], elementId: m[2] };
  return null;
}

export const pageLink = (pageId: string) => `${PREFIX}page/${pageId}`;
export const elementLink = (pageId: string, elementId: string) => `${PREFIX}el/${pageId}/${elementId}`;

/** Where an internal link points right now, or null if the page/element is gone. */
export interface ResolvedTarget {
  page: Page;
  element?: SketchElement;
  /** The page's name, or the element's (a card is named by its title). */
  name: string;
  /** "Page › element" */
  label: string;
}

/** `pages` must hold current elements for every page (see `livePages`). */
export function resolveInternalLink(link: string | null | undefined, pages: Page[]): ResolvedTarget | null {
  const t = parseInternalLink(link);
  if (!t) return null;
  if (t.kind === "page") {
    const page = pages.find((p) => p.id === t.pageId);
    return page ? { page, name: page.name, label: page.name } : null;
  }
  // Prefer the page the link names, but follow the element if it moved pages.
  const named = pages.find((p) => p.id === t.pageId);
  for (const page of named ? [named, ...pages.filter((p) => p !== named)] : pages) {
    const element = page.elements.find((e) => e.id === t.elementId);
    if (element) {
      const name = elementLabel(groupTitle(element, page.elements));
      return { page, element, name, label: `${page.name} › ${name}` };
    }
  }
  return null;
}

/** For an element in a group (like a card), its title names it best: the largest text, topmost on ties. */
function groupTitle(el: SketchElement, pageElements: SketchElement[]): SketchElement {
  if (!el.groupId) return el;
  const texts = pageElements.filter((e) => e.groupId === el.groupId && e.text?.trim());
  const size = (e: SketchElement) => e.fontSize ?? 20;
  const better = (a: SketchElement, b: SketchElement) => size(a) > size(b) || (size(a) === size(b) && a.y < b.y);
  return texts.reduce<SketchElement | undefined>((best, e) => (!best || better(e, best) ? e : best), undefined) ?? el;
}

/** A short human name for an element: frame name, first line of its text, or its type. */
export function elementLabel(el: SketchElement): string {
  const raw = el.type === "frame" ? el.name : el.text;
  const line = raw?.split("\n").find((l) => l.trim())?.trim();
  if (line) return line.length > 48 ? line.slice(0, 47) + "…" : line;
  return el.type === "frame" ? "Frame" : el.type[0].toUpperCase() + el.type.slice(1);
}

/** Link-picker suggestions: pages, frames and text-bearing elements matching `query`. */
export interface LinkSuggestion {
  link: string;
  kind: "page" | "frame" | "text";
  label: string;
  pageName: string;
}

export function linkSuggestions(pages: Page[], query: string, limit = 40): LinkSuggestion[] {
  const q = query.trim().toLowerCase();
  const out: LinkSuggestion[] = [];
  const matches = (s: string | undefined) => !q || (!!s && s.toLowerCase().includes(q));
  for (const p of pages) {
    if (matches(p.name)) out.push({ link: pageLink(p.id), kind: "page", label: p.name, pageName: p.name });
  }
  for (const p of pages) {
    for (const e of p.elements) {
      if (e.type === "frame" && matches(e.name)) out.push({ link: elementLink(p.id, e.id), kind: "frame", label: elementLabel(e), pageName: p.name });
    }
  }
  // Text is only listed once the user types — otherwise the list is just the outline.
  // A card (a group) is listed once, by its title, whichever of its texts matched.
  if (q) {
    for (const p of pages) {
      const seenGroups = new Set<string>();
      for (const e of p.elements) {
        if (e.type === "frame" || !e.text || !matches(e.text)) continue;
        if (e.groupId) {
          if (seenGroups.has(e.groupId)) continue;
          seenGroups.add(e.groupId);
        }
        const title = groupTitle(e, p.elements);
        out.push({ link: elementLink(p.id, title.id), kind: "text", label: elementLabel(title), pageName: p.name });
      }
    }
  }
  return out.slice(0, limit);
}

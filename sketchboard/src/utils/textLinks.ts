import type { TextLink } from "../types";
import { sanitizeLink } from "./embed";

/**
 * Carry link ranges across an edit from `prev` to `next`. Text typed right at
 * a link's start or end stays outside it; text typed inside it joins it.
 */
export function shiftLinks(links: TextLink[] | undefined, prev: string, next: string): TextLink[] | undefined {
  if (!links?.length || prev === next) return links;
  let p = 0;
  const max = Math.min(prev.length, next.length);
  while (p < max && prev[p] === next[p]) p++;
  let s = 0;
  while (s < max - p && prev[prev.length - 1 - s] === next[next.length - 1 - s]) s++;
  const oldEnd = prev.length - s;
  const inserted = next.length - s - p;
  const delta = next.length - prev.length;
  const mapStart = (pos: number) => (pos < p ? pos : pos >= oldEnd ? pos + delta : p + inserted);
  const mapEnd = (pos: number) => (pos <= p ? pos : pos >= oldEnd ? pos + delta : p);
  const out = links.map((l) => ({ ...l, start: mapStart(l.start), end: mapEnd(l.end) })).filter((l) => l.end > l.start);
  return out.length ? out : undefined;
}

export function linkAtOffset(links: TextLink[] | undefined, start: number, end = start): TextLink | undefined {
  return links?.find((l) => (start === end ? l.start <= start && l.end >= start : l.start < end && l.end > start));
}

/** Apply `url` to [start, end), replacing any links it overlaps. `url: null` removes links there. */
export function setLinkRange(links: TextLink[] | undefined, start: number, end: number, url: string | null): TextLink[] | undefined {
  const kept: TextLink[] = [];
  for (const l of links ?? []) {
    if (l.end <= start || l.start >= end) kept.push(l);
    else {
      if (l.start < start) kept.push({ ...l, end: start });
      if (l.end > end) kept.push({ ...l, start: end });
    }
  }
  if (url) kept.push({ start, end, url });
  kept.sort((a, b) => a.start - b.start);
  return kept.length ? kept : undefined;
}

const URL_RE = /\b(?:https?:\/\/|www\.)[^\s<>"']+/gi;

/** Turn bare URLs typed into text into links, leaving existing links untouched. */
export function autoLink(text: string, links: TextLink[] | undefined): TextLink[] | undefined {
  let out = links;
  for (const m of text.matchAll(URL_RE)) {
    const raw = m[0].replace(/[.,;:!?)\]}]+$/, "");
    const start = m.index!;
    const end = start + raw.length;
    if (linkAtOffset(out, start, end)) continue;
    const url = sanitizeLink(raw);
    if (url) out = setLinkRange(out, start, end, url);
  }
  return out;
}

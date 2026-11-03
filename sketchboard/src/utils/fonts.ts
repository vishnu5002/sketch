import { BUNDLED_FACES } from "./bundledFaces";

export type FontCategory = "hand" | "sans" | "serif" | "display" | "mono";

export interface FontDef {
  family: string;
  category: FontCategory;
  /** also hosted on Google Fonts, so SVG exports can reference it instead of embedding */
  onGoogle?: boolean;
  note?: string;
}

export const BUNDLED_FONTS: FontDef[] = [
  { family: "Excalifont", category: "hand", note: "Excalidraw's hand-drawn font" },
  { family: "Virgil", category: "hand", note: "Classic Excalidraw" },
  { family: "Kalam", category: "hand", onGoogle: true },
  { family: "Nunito", category: "sans", onGoogle: true },
  { family: "Inter", category: "sans", onGoogle: true },
  { family: "Liberation Sans", category: "sans", note: "Helvetica-like" },
  { family: "Lilita One", category: "display", onGoogle: true },
  { family: "Comic Shanns", category: "mono", note: "Excalidraw's code font" },
  { family: "Cascadia Code", category: "mono" },
  { family: "Fira Code", category: "mono", onGoogle: true },
];

/** The three one-click choices, mirroring Excalidraw's hand-drawn / normal / code trio. */
export const QUICK_FONTS = ["Excalifont", "Nunito", "Comic Shanns"];
export const DEFAULT_FONT = "Excalifont";

// Values written by earlier versions of this app.
const LEGACY: Record<string, string> = { hand: "Kalam", normal: "Inter", code: "Fira Code" };

export function resolveFamily(f: string | undefined): string {
  if (!f) return DEFAULT_FONT;
  return LEGACY[f] ?? f;
}

export function isLegacyFamily(f: string | undefined): boolean {
  return !!f && f in LEGACY;
}

const bundled = new Map(BUNDLED_FONTS.map((f) => [f.family, f]));
export const isBundled = (family: string) => bundled.has(resolveFamily(family));

const GENERIC: Record<FontCategory, string> = {
  hand: "Excalifont, cursive",
  sans: "Nunito, Inter, sans-serif",
  serif: "Georgia, serif",
  display: "Nunito, sans-serif",
  mono: '"Comic Shanns", monospace',
};

// Google categories are only known once the catalog is loaded; remember them for fallbacks.
const knownCategory = new Map<string, FontCategory>();

export function categoryOf(family: string): FontCategory {
  const f = resolveFamily(family);
  return bundled.get(f)?.category ?? knownCategory.get(f) ?? "sans";
}

export function fontStack(family: string | undefined): string {
  const f = resolveFamily(family);
  return `"${f}", ${GENERIC[categoryOf(f)]}`;
}

// ---------- registration of bundled faces ----------

let registered = false;
export function registerBundledFonts() {
  if (registered || typeof FontFace === "undefined") return;
  registered = true;
  for (const face of BUNDLED_FACES) {
    const ff = new FontFace(face.family, `url(${face.url}) format("woff2")`, {
      unicodeRange: face.range,
      display: "swap",
    });
    document.fonts.add(ff);
  }
}

// ---------- Google Fonts catalog ----------

export interface GoogleFont {
  family: string;
  category: FontCategory;
  variants: string[];
  rank: number;
}

const CAT_MAP: Record<string, FontCategory> = {
  "Sans Serif": "sans",
  Serif: "serif",
  Display: "display",
  Handwriting: "hand",
  Monospace: "mono",
};

let catalogPromise: Promise<GoogleFont[]> | null = null;
let catalogByName: Map<string, GoogleFont> | null = null;

export function loadCatalog(): Promise<GoogleFont[]> {
  catalogPromise ??= import("../data/googleFonts.json").then((m) => {
    const data = (m.default ?? m) as { categories: string[]; fonts: [string, number, string][] };
    const list = data.fonts.map(([family, cat, variants], rank) => ({
      family,
      category: CAT_MAP[data.categories[cat]] ?? "sans",
      variants: variants.split(","),
      rank,
    }));
    catalogByName = new Map(list.map((f) => [f.family, f]));
    for (const f of list) knownCategory.set(f.family, f.category);
    return list;
  });
  return catalogPromise;
}

/** css2 axis spec for regular + bold (+ italics) restricted to what the family actually ships. */
function axisSpec(variants: string[]): string {
  const tuples: [number, number][] = [];
  for (const ital of [0, 1]) {
    for (const w of [400, 700]) if (variants.includes(ital ? `${w}i` : `${w}`)) tuples.push([ital, w]);
  }
  if (!tuples.length) {
    const first = variants[0] ?? "400";
    tuples.push([first.endsWith("i") ? 1 : 0, parseInt(first, 10) || 400]);
  }
  return tuples.some(([i]) => i)
    ? `ital,wght@${tuples.map(([i, w]) => `${i},${w}`).join(";")}`
    : `wght@${tuples.map(([, w]) => w).join(";")}`;
}

function googleCssUrl(family: string, variants: string[]): string {
  return `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}:${axisSpec(variants)}&display=swap`;
}

export function googleCssUrlFor(family: string): string | null {
  const g = catalogByName?.get(resolveFamily(family));
  return g ? googleCssUrl(g.family, g.variants) : null;
}

function injectStylesheet(href: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLLinkElement>(`link[data-font-href="${CSS.escape(href)}"]`);
    if (existing) {
      resolve();
      return;
    }
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.dataset.fontHref = href;
    link.onload = () => resolve();
    link.onerror = () => {
      link.remove();
      reject(new Error("stylesheet failed"));
    };
    document.head.appendChild(link);
  });
}

// ---------- loading ----------

const loads = new Map<string, Promise<boolean>>();
const listeners = new Set<(family: string) => void>();

export function onFontLoaded(fn: (family: string) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function waitForFace(family: string): Promise<boolean> {
  await Promise.all([document.fonts.load(`400 20px "${family}"`), document.fonts.load(`700 20px "${family}"`)]).catch(() => undefined);
  return document.fonts.check(`400 20px "${family}"`);
}

/** Make a family usable on canvas. Bundled fonts are instant; Google ones are fetched on demand. */
export function loadFont(family: string | undefined): Promise<boolean> {
  const f = resolveFamily(family);
  const pending = loads.get(f);
  if (pending) return pending;
  const p = (async () => {
    if (bundled.has(f)) return waitForFace(f);
    const list = await loadCatalog();
    const g = list.find((x) => x.family === f);
    if (!g) return false;
    try {
      await injectStylesheet(googleCssUrl(g.family, g.variants));
    } catch {
      loads.delete(f);
      return false;
    }
    return waitForFace(f);
  })();
  loads.set(f, p);
  p.then((ok) => ok && listeners.forEach((l) => l(f)));
  return p;
}

export async function loadFonts(families: Iterable<string | undefined>, timeoutMs = 3000): Promise<void> {
  const unique = [...new Set([...families].map(resolveFamily))];
  await Promise.race([Promise.all(unique.map(loadFont)), new Promise((r) => setTimeout(r, timeoutMs))]);
}

// ---------- picker previews ----------

// Preview faces register under a private alias. Reusing the real family name for
// a glyph-subset would shadow the full font once it's loaded.
const previews = new Set<string>();
export const previewFamily = (family: string) => `__preview ${family}`;

export function loadPreview(family: string): void {
  if (previews.has(family) || bundled.has(family)) return;
  previews.add(family);
  const url = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family).replace(/%20/g, "+")}&text=${encodeURIComponent(family)}`;
  fetch(url)
    .then((r) => (r.ok ? r.text() : Promise.reject()))
    .then((css) => {
      const style = document.createElement("style");
      style.textContent = css.replace(/font-family:\s*'[^']+'/g, `font-family: '${previewFamily(family)}'`);
      document.head.appendChild(style);
    })
    .catch(() => previews.delete(family));
}

// ---------- SVG export support ----------

/** CSS that makes an exported SVG render with the same fonts outside this app. */
export async function fontCssForExport(families: Iterable<string | undefined>): Promise<string> {
  const unique = [...new Set([...families].map(resolveFamily))];
  await loadCatalog().catch(() => undefined);
  const parts: string[] = [];
  for (const f of unique) {
    const def = bundled.get(f);
    if (!def || def.onGoogle) {
      const url = googleCssUrlFor(f);
      if (url) parts.push(`@import url('${url}');`);
      continue;
    }
    // Excalidraw-only fonts aren't hosted anywhere public, so embed them.
    for (const face of BUNDLED_FACES.filter((x) => x.family === f)) {
      try {
        const buf = await (await fetch(face.url)).arrayBuffer();
        let bin = "";
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        parts.push(
          `@font-face { font-family: '${f}'; src: url(data:font/woff2;base64,${btoa(bin)}) format('woff2');${face.range ? ` unicode-range: ${face.range};` : ""} }`,
        );
      } catch {
        // missing face just falls back in the exported file
      }
    }
  }
  // @import rules must precede every other rule in a stylesheet
  return [...parts.filter((p) => p.startsWith("@import")), ...parts.filter((p) => !p.startsWith("@import"))].join("\n");
}

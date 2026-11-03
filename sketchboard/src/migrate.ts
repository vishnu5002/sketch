// One-time move of what this browser stored before the service had a database:
// the drawing, its version history, the library and preferences. The old browser
// copy is left untouched as a fallback.
import { api, type ProjectMeta } from "./api";
import type { DocumentFile, LibraryItem, Page } from "./types";
import { idbGet, idbSet } from "./utils/db";
import { externalizeImages } from "./utils/images";

const LEGACY_KEY = "sketchboard.v1";
const REF = "vref:";

interface OldDoc {
  pages?: Page[];
  activePageId?: string;
  canvasBg?: string;
  theme?: string;
  style?: unknown;
  recentColors?: string[];
  gridEnabled?: boolean;
  snapEnabled?: boolean;
  showMinimap?: boolean;
  showStats?: boolean;
}

interface OldVersion {
  id: string;
  created: number;
  kind: string;
  label?: string;
  reason?: string;
}

const safe = <T>(p: Promise<T>) => p.catch(() => undefined);

async function hydrateRefs(pages: Page[]): Promise<Page[]> {
  const cache = new Map<string, string>();
  return Promise.all(
    pages.map(async (p) => ({
      ...p,
      elements: await Promise.all(
        p.elements.map(async (e) => {
          if (e.type !== "image" || !e.src?.startsWith(REF)) return e;
          const h = e.src.slice(REF.length);
          if (!cache.has(h)) cache.set(h, (await safe(idbGet<string>(`vblob:${h}`))) ?? "");
          return { ...e, src: cache.get(h) };
        }),
      ),
    })),
  );
}

function legacyDoc(): OldDoc | undefined {
  try {
    const legacy = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "null");
    if (!legacy?.elements) return undefined;
    const id = crypto.randomUUID();
    return { pages: [{ id, name: "Page 1", elements: legacy.elements, viewport: legacy.viewport }], activePageId: id, theme: legacy.appTheme, style: legacy.style };
  } catch {
    return undefined;
  }
}

/** Returns the project created from browser data, or null if there was nothing to move. */
export async function migrateBrowserData(): Promise<ProjectMeta | null> {
  if (await safe(idbGet<number>("migrated"))) return null;

  const old = (await safe(idbGet<OldDoc>("doc"))) ?? legacyDoc();
  const library = (await safe(idbGet<LibraryItem[]>("library"))) ?? [];
  const index = ((await safe(idbGet<OldVersion[]>("versions:index"))) ?? []).sort((a, b) => a.created - b.created);
  const handle = await safe(idbGet<{ name?: string } | null>("fileHandle"));
  const hasDrawing = !!old?.pages?.some((p) => p.elements?.length) || index.length > 0;
  if (!hasDrawing && !library.length && !old) {
    // Nothing from before the database in this browser.
    await safe(idbSet("migrated", Date.now()));
    return null;
  }
  // Generated once and kept, so a retry after a dropped connection can't import twice.
  let key = await safe(idbGet<string>("migrationKey"));
  if (!key) {
    key = crypto.randomUUID();
    await idbSet("migrationKey", key);
  }

  let doc: DocumentFile | undefined;
  if (hasDrawing && old?.pages?.length) {
    const pages = old.pages.map((p) => ({ ...p, elements: p.elements ?? [] }));
    doc = (await externalizeImages({ type: "sketchboard", version: 2, pages, activePageId: old.activePageId ?? pages[0].id, canvasBg: old.canvasBg })).doc;
  }

  const versions = [];
  if (doc) {
    for (const v of index) {
      const stored = await safe(idbGet<{ pages: Page[]; activePageId: string; canvasBg?: string }>(`version:${v.id}`));
      if (!stored?.pages) continue;
      const vdoc = (await externalizeImages({ type: "sketchboard", version: 2, pages: await hydrateRefs(stored.pages), activePageId: stored.activePageId, canvasBg: stored.canvasBg })).doc;
      versions.push({ kind: v.kind, label: v.label, reason: v.reason, created: v.created, doc: vdoc });
    }
  }

  const prefs = old
    ? Object.fromEntries(
        Object.entries({
          theme: old.theme,
          style: old.style,
          recentColors: old.recentColors,
          gridEnabled: old.gridEnabled,
          snapEnabled: old.snapEnabled,
          showMinimap: old.showMinimap,
          showStats: old.showStats,
        }).filter(([, v]) => v !== undefined),
      )
    : {};

  const name = handle?.name ? handle.name.replace(/(\.sketchboard)?\.json$/i, "") : "My drawing";
  const res = await api<{ project: ProjectMeta | null; skipped?: boolean }>("/api/import/browser", {
    body: { key, name, doc, versions, library, settings: prefs },
  });
  await safe(idbSet("migrated", Date.now()));
  return res.project ?? null;
}

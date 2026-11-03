import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Search, WifiOff } from "lucide-react";
import { useStore } from "../store";
import {
  BUNDLED_FONTS,
  QUICK_FONTS,
  fontStack,
  loadCatalog,
  loadFont,
  loadPreview,
  previewFamily,
  resolveFamily,
  type FontCategory,
  type GoogleFont,
} from "../utils/fonts";

const QUICK_LABELS: Record<string, string> = { Excalifont: "Hand", Nunito: "Normal", "Comic Shanns": "Code" };

const CATEGORIES: { value: FontCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "hand", label: "Handwriting" },
  { value: "sans", label: "Sans" },
  { value: "serif", label: "Serif" },
  { value: "display", label: "Display" },
  { value: "mono", label: "Mono" },
];

const CATEGORY_NAME: Record<FontCategory, string> = { hand: "Handwriting", sans: "Sans", serif: "Serif", display: "Display", mono: "Mono" };

const PAGE = 60;

interface Row {
  family: string;
  category: FontCategory;
  google: boolean;
  note?: string;
}

function useChoose(onChange: (f: string) => void) {
  const [loading, setLoading] = useState<string | null>(null);
  const choose = (family: string) => {
    onChange(family);
    setLoading(family);
    loadFont(family).then((ok) => {
      setLoading((l) => (l === family ? null : l));
      if (!ok) useStore.getState().showToast(`Couldn't load "${family}" — check your internet connection`);
    });
  };
  return { choose, loading };
}

export default function FontPicker({ value, onChange }: { value: string; onChange: (family: string) => void }) {
  const current = resolveFamily(value);
  const [openAt, setOpenAt] = useState<{ left: number; top: number } | null>(null);
  const anchorRef = useRef<HTMLButtonElement>(null);
  const toggle = () => {
    if (openAt) {
      setOpenAt(null);
      return;
    }
    const r = anchorRef.current!.getBoundingClientRect();
    const height = Math.min(500, window.innerHeight - 24);
    setOpenAt({ left: Math.min(r.right + 10, window.innerWidth - 330), top: Math.max(12, Math.min(r.top - 140, window.innerHeight - height - 12)) });
  };
  const { choose, loading } = useChoose(onChange);

  return (
    <div className="font-picker">
      <div className="segmented">
        {QUICK_FONTS.map((f) => (
          <button key={f} className={`segmented-btn ${current === f ? "active" : ""}`} style={{ fontFamily: fontStack(f) }} title={f} onClick={() => choose(f)}>
            {QUICK_LABELS[f] ?? f}
          </button>
        ))}
      </div>
      <button ref={anchorRef} className={`font-current ${openAt ? "open" : ""}`} onClick={toggle} title="Browse all fonts">
        <span style={{ fontFamily: fontStack(current) }}>{current}</span>
        {loading === current ? <Loader2 size={14} className="spin" /> : <ChevronDown size={14} />}
      </button>
      {openAt &&
        createPortal(
          <FontPopover
            anchorRef={anchorRef}
            pos={openAt}
            current={current}
            loading={loading}
            onPick={(f) => choose(f)}
            onClose={() => setOpenAt(null)}
          />,
          document.body,
        )}
    </div>
  );
}

function FontRow({ row, active, highlighted, loading, onPick, onHover }: { row: Row; active: boolean; highlighted: boolean; loading: boolean; onPick: () => void; onHover: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const [visible, setVisible] = useState(!row.google);

  useEffect(() => {
    if (!row.google || visible) return;
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          loadPreview(row.family);
          setVisible(true);
          io.disconnect();
        }
      },
      { root: el.closest(".font-list"), rootMargin: "120px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [row.google, row.family, visible]);

  useEffect(() => {
    if (highlighted) ref.current?.scrollIntoView({ block: "nearest" });
  }, [highlighted]);

  const family = row.google ? `"${previewFamily(row.family)}", "${row.family}", system-ui, sans-serif` : fontStack(row.family);
  return (
    <button ref={ref} className={`font-row ${active ? "active" : ""} ${highlighted ? "highlighted" : ""}`} onClick={onPick} onMouseMove={onHover}>
      <span className="font-row-name" style={{ fontFamily: visible ? family : undefined }}>
        {row.family}
      </span>
      <span className="font-row-meta">{row.note ?? CATEGORY_NAME[row.category]}</span>
      <span className="font-row-state">{loading ? <Loader2 size={14} className="spin" /> : active ? <Check size={14} /> : null}</span>
    </button>
  );
}

function FontPopover({
  anchorRef,
  pos,
  current,
  loading,
  onPick,
  onClose,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  pos: { left: number; top: number };
  current: string;
  loading: string | null;
  onPick: (family: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<FontCategory | "all">("all");
  const [catalog, setCatalog] = useState<GoogleFont[] | null>(null);
  const [catalogError, setCatalogError] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [highlight, setHighlight] = useState(0);
  const elements = useStore((s) => s.elements);
  const online = typeof navigator === "undefined" || navigator.onLine;

  useEffect(() => {
    requestAnimationFrame(() => inputRef.current?.focus());
    loadCatalog().then(setCatalog, () => setCatalogError(true));
  }, []);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchorRef.current?.contains(e.target as Node)) onClose();
    };
    window.addEventListener("pointerdown", close, true);
    return () => window.removeEventListener("pointerdown", close, true);
  }, [anchorRef, onClose]);

  const q = query.trim().toLowerCase();
  const matches = (r: Row) => (category === "all" || r.category === category) && (!q || r.family.toLowerCase().includes(q));
  const byRelevance = (a: Row, b: Row) => (q ? Number(!a.family.toLowerCase().startsWith(q)) - Number(!b.family.toLowerCase().startsWith(q)) : 0);

  const bundledRows: Row[] = useMemo(() => BUNDLED_FONTS.map((f) => ({ family: f.family, category: f.category, google: false, note: f.note })), []);
  const bundledNames = useMemo(() => new Set(BUNDLED_FONTS.map((f) => f.family)), []);

  const usedRows: Row[] = useMemo(() => {
    const names = [...new Set(elements.filter((e) => e.text).map((e) => resolveFamily(e.fontFamily)))];
    return names.map((family) => {
      const b = BUNDLED_FONTS.find((f) => f.family === family);
      const g = catalog?.find((f) => f.family === family);
      return { family, category: b?.category ?? g?.category ?? "sans", google: !b };
    });
  }, [elements, catalog]);

  const googleRows: Row[] = useMemo(() => {
    if (!catalog) return [];
    return catalog.filter((f) => !bundledNames.has(f.family)).map((f) => ({ family: f.family, category: f.category, google: true }));
  }, [catalog, bundledNames]);

  const used = usedRows.filter(matches).sort(byRelevance);
  const builtIn = bundledRows.filter(matches).sort(byRelevance);
  const googleAll = googleRows.filter(matches).sort(byRelevance);
  const google = googleAll.slice(0, limit);
  const flat = [...used, ...builtIn, ...google];

  let index = 0;
  const section = (title: string, rows: Row[], extra?: string) =>
    rows.length > 0 && (
      <div className="font-section">
        <div className="font-section-title">
          {title}
          {extra && <span>{extra}</span>}
        </div>
        {rows.map((row) => {
          const i = index++;
          return (
            <FontRow
              key={title + row.family}
              row={row}
              active={row.family === current}
              highlighted={i === highlight}
              loading={loading === row.family}
              onPick={() => onPick(row.family)}
              onHover={() => setHighlight(i)}
            />
          );
        })}
      </div>
    );

  return (
    <div ref={ref} className="font-popover" style={pos} onPointerDown={(e) => e.stopPropagation()}>
      <div className="font-search">
        <Search size={15} />
        <input
          ref={inputRef}
          value={query}
          placeholder={catalog ? `Search ${(googleRows.length + bundledRows.length).toLocaleString()} fonts…` : "Search fonts…"}
          onChange={(e) => {
            setQuery(e.target.value);
            setHighlight(0);
            setLimit(PAGE);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => {
                const next = Math.min(flat.length - 1, h + 1);
                if (next >= flat.length - 5 && google.length < googleAll.length) setLimit((l) => l + PAGE);
                return next;
              });
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(0, h - 1));
            } else if (e.key === "Enter" && flat[highlight]) {
              onPick(flat[highlight].family);
            } else if (e.key === "Escape") {
              onClose();
            }
          }}
        />
      </div>
      <div className="font-chips">
        {CATEGORIES.map((c) => (
          <button key={c.value} className={category === c.value ? "active" : ""} onClick={() => {
              setCategory(c.value);
              setHighlight(0);
              setLimit(PAGE);
            }}>
            {c.label}
          </button>
        ))}
      </div>
      <div
        className="font-list"
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.scrollTop + el.clientHeight > el.scrollHeight - 200 && google.length < googleAll.length) setLimit((l) => l + PAGE);
        }}
      >
        {section("In this drawing", used)}
        {section("Built-in · works offline", builtIn)}
        {catalog && section("Google Fonts", google, `${googleAll.length.toLocaleString()}`)}
        {!catalog && !catalogError && <div className="font-empty">Loading Google Fonts…</div>}
        {catalogError && <div className="font-empty">Couldn't load the Google Fonts list.</div>}
        {catalog && flat.length === 0 && <div className="font-empty">No fonts match "{query}"</div>}
        {!online && (
          <div className="font-offline">
            <WifiOff size={14} /> Offline — Google Fonts need an internet connection. Built-in fonts still work.
          </div>
        )}
      </div>
    </div>
  );
}

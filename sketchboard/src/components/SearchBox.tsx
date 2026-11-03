import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Search, X } from "lucide-react";
import { useStore } from "../store";
import { focusElement } from "../actions";

interface Result {
  pageId: string;
  pageName: string;
  id: string;
  text: string;
  kind: string;
}

function highlight(text: string, q: string) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  const start = Math.max(0, i - 24);
  return (
    <>
      {start > 0 && "…"}
      {text.slice(start, i)}
      <mark>{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length, i + q.length + 40)}
    </>
  );
}

export default function SearchBox() {
  const open = useStore((s) => s.searchOpen);
  const elements = useStore((s) => s.elements);
  const pages = useStore((s) => s.pages);
  const activePageId = useStore((s) => s.activePageId);
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [visited, setVisited] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) requestAnimationFrame(() => inputRef.current?.select());
  }, [open]);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const out: Result[] = [];
    for (const p of pages) {
      const els = p.id === activePageId ? elements : p.elements;
      for (const e of els) {
        for (const [kind, val] of [
          ["text", e.text],
          ["frame", e.type === "frame" ? e.name : undefined],
          ["link", [e.link, ...(e.textLinks ?? []).map((l) => l.url)].filter(Boolean).join(" ")],
        ] as const) {
          if (val && val.toLowerCase().includes(q)) {
            out.push({ pageId: p.id, pageName: p.name, id: e.id, text: val.replace(/\n/g, " "), kind });
            break;
          }
        }
      }
    }
    return out;
  }, [query, elements, pages, activePageId]);

  if (!open) return null;

  const go = (i: number) => {
    if (!results.length) return;
    const n = (i + results.length) % results.length;
    setIndex(n);
    setVisited(true);
    focusElement(results[n].id, results[n].pageId);
  };

  return (
    <div className="search-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="search-row">
        <Search size={15} />
        <input
          ref={inputRef}
          value={query}
          placeholder="Find text, frames, links…"
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
            setVisited(false);
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === "Enter") go(e.shiftKey ? index - 1 : visited ? index + 1 : index);
            if (e.key === "Escape") useStore.getState().setUI({ searchOpen: false });
          }}
        />
        <span className="search-count">{query ? `${results.length ? index + 1 : 0}/${results.length}` : ""}</span>
        <button onClick={() => go(index - 1)} disabled={!results.length} title="Previous (Shift+Enter)">
          <ChevronUp size={15} />
        </button>
        <button onClick={() => go(index + 1)} disabled={!results.length} title="Next (Enter)">
          <ChevronDown size={15} />
        </button>
        <button onClick={() => useStore.getState().setUI({ searchOpen: false })} title="Close (Esc)">
          <X size={15} />
        </button>
      </div>
      {results.length > 0 && (
        <div className="search-results">
          {results.slice(0, 60).map((r, i) => (
            <button key={r.pageId + r.id} className={i === index ? "active" : ""} onClick={() => go(i)}>
              <span className="result-text">{highlight(r.text, query.trim())}</span>
              <span className="result-meta">
                {r.kind}
                {pages.length > 1 ? ` · ${r.pageName}` : ""}
              </span>
            </button>
          ))}
        </div>
      )}
      {query && !results.length && <div className="search-empty">No matches</div>}
    </div>
  );
}

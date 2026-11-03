import { X } from "lucide-react";
import { useStore } from "../store";
import type { SketchElement } from "../types";
import { getCommonBounds } from "../utils/geometry";

function NumField({ label, value, onChange, disabled }: { label: string; value: number; onChange: (v: number) => void; disabled?: boolean }) {
  return (
    <label className="stat-field">
      <span>{label}</span>
      <input
        type="number"
        value={Math.round(value * 100) / 100}
        disabled={disabled}
        onKeyDown={(e) => e.stopPropagation()}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(n);
        }}
      />
    </label>
  );
}

export default function StatsPanel() {
  const show = useStore((s) => s.showStats);
  const elements = useStore((s) => s.elements);
  const selectedIds = useStore((s) => s.selectedIds);
  const pages = useStore((s) => s.pages);
  const activePageId = useStore((s) => s.activePageId);
  if (!show) return null;
  const st = useStore.getState;
  const ids = new Set(selectedIds);
  const sel = elements.filter((e) => ids.has(e.id));
  const single = sel.length === 1 ? sel[0] : undefined;
  const bounds = getCommonBounds(sel);

  const patch = (el: SketchElement, p: Partial<SketchElement>) => {
    if (el.points && (p.width !== undefined || p.height !== undefined)) {
      const sx = p.width !== undefined && el.width ? p.width / el.width : 1;
      const sy = p.height !== undefined && el.height ? p.height / el.height : 1;
      p.points = el.points.map(([x, y]) => [x * sx, y * sy]);
    }
    st().patchSelected(p);
    if (el.type === "frame" && (p.x !== undefined || p.y !== undefined)) {
      const dx = (p.x ?? el.x) - el.x;
      const dy = (p.y ?? el.y) - el.y;
      const kids = st().elements.filter((c) => c.frameId === el.id);
      st().updateElements(kids.map((c) => ({ id: c.id, patch: { x: c.x + dx, y: c.y + dy } })));
    }
  };

  return (
    <div className="stats-panel" onPointerDown={(e) => e.stopPropagation()}>
      <div className="panel-header">
        <span>Stats</span>
        <button onClick={() => st().setUI({ showStats: false })} title="Close (Alt+/)">
          <X size={14} />
        </button>
      </div>
      <div className="stat-row">
        <span>Page</span>
        <b>{pages.find((p) => p.id === activePageId)?.name}</b>
      </div>
      <div className="stat-row">
        <span>Elements</span>
        <b>{elements.length}</b>
      </div>
      {sel.length > 0 && (
        <div className="stat-row">
          <span>Selected</span>
          <b>{sel.length}</b>
        </div>
      )}
      {single && (
        <>
          <div className="stat-type">{single.type}</div>
          <div className="stat-grid">
            <NumField label="X" value={single.x} onChange={(v) => patch(single, { x: v })} />
            <NumField label="Y" value={single.y} onChange={(v) => patch(single, { y: v })} />
            <NumField label="W" value={single.width} disabled={single.type === "text"} onChange={(v) => v > 0 && patch(single, { width: v })} />
            <NumField label="H" value={single.height} disabled={single.type === "text"} onChange={(v) => v > 0 && patch(single, { height: v })} />
            <NumField
              label="°"
              value={((single.angle * 180) / Math.PI + 360) % 360}
              disabled={single.type === "frame"}
              onChange={(v) => patch(single, { angle: (v * Math.PI) / 180 })}
            />
            {single.type === "text" && <NumField label="Size" value={single.fontSize ?? 20} onChange={(v) => v >= 4 && st().setStyle({ fontSize: v })} />}
          </div>
        </>
      )}
      {sel.length > 1 && bounds && (
        <div className="stat-grid readonly">
          <div>X {Math.round(bounds.x1)}</div>
          <div>Y {Math.round(bounds.y1)}</div>
          <div>W {Math.round(bounds.x2 - bounds.x1)}</div>
          <div>H {Math.round(bounds.y2 - bounds.y1)}</div>
        </div>
      )}
    </div>
  );
}

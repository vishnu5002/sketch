import { useEffect, useRef, useState } from "react";
import {
  MousePointer2,
  Hand,
  Square,
  Diamond,
  Circle,
  ArrowRight,
  Minus,
  Pencil,
  Type,
  Image as ImageIcon,
  Eraser,
  Lock,
  LockOpen,
  Frame,
  Globe,
  StickyNote,
  Wand2,
  Shapes,
  LayoutTemplate,
} from "lucide-react";
import { useStore } from "../store";
import type { ToolType } from "../types";

type ToolDef = { tool: ToolType; icon: typeof MousePointer2; label: string; key: string };

const TOOLS: ToolDef[] = [
  { tool: "pan", icon: Hand, label: "Hand (panning tool)", key: "H" },
  { tool: "selection", icon: MousePointer2, label: "Selection", key: "V" },
  { tool: "rectangle", icon: Square, label: "Rectangle", key: "R" },
  { tool: "diamond", icon: Diamond, label: "Diamond", key: "D" },
  { tool: "ellipse", icon: Circle, label: "Ellipse", key: "O" },
  { tool: "arrow", icon: ArrowRight, label: "Arrow", key: "A" },
  { tool: "line", icon: Minus, label: "Line", key: "L" },
  { tool: "draw", icon: Pencil, label: "Draw", key: "P" },
  { tool: "text", icon: Type, label: "Text", key: "T" },
  { tool: "sticky", icon: StickyNote, label: "Sticky note", key: "N" },
  { tool: "image", icon: ImageIcon, label: "Insert image", key: "9" },
  { tool: "eraser", icon: Eraser, label: "Eraser", key: "E" },
];

const EXTRA: ToolDef[] = [
  { tool: "frame", icon: Frame, label: "Frame tool", key: "F" },
  { tool: "embed", icon: Globe, label: "Web embed", key: "W" },
  { tool: "laser", icon: Wand2, label: "Laser pointer", key: "K" },
];

export default function Toolbar() {
  const tool = useStore((s) => s.tool);
  const lockTool = useStore((s) => s.lockTool);
  const setTool = useStore((s) => s.setTool);
  const toggleLockTool = useStore((s) => s.toggleLockTool);
  const setUI = useStore((s) => s.setUI);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const close = (e: PointerEvent) => {
      if (!moreRef.current?.contains(e.target as Node)) setMoreOpen(false);
    };
    window.addEventListener("pointerdown", close);
    return () => window.removeEventListener("pointerdown", close);
  }, [moreOpen]);

  const extraActive = EXTRA.find((t) => t.tool === tool);
  const MoreIcon = extraActive?.icon ?? Shapes;

  return (
    <div className="toolbar">
      <button
        className={`toolbar-btn lock-btn ${lockTool ? "active" : ""}`}
        title="Keep selected tool active after drawing (Q)"
        onClick={toggleLockTool}
      >
        {lockTool ? <Lock size={15} /> : <LockOpen size={15} />}
      </button>
      <div className="toolbar-divider" />
      {TOOLS.map(({ tool: t, icon: Icon, label, key }) => (
        <button key={t} className={`toolbar-btn ${tool === t ? "active" : ""}`} title={`${label} — ${key}`} onClick={() => setTool(t)}>
          <Icon size={18} strokeWidth={1.75} />
          <span className="tool-key">{key}</span>
        </button>
      ))}
      <div className="toolbar-divider" />
      <div className="more-tools" ref={moreRef}>
        <button className={`toolbar-btn ${extraActive ? "active" : ""}`} title="More tools" onClick={() => setMoreOpen((o) => !o)}>
          <MoreIcon size={18} strokeWidth={1.75} />
        </button>
        {moreOpen && (
          <div className="dropdown more-dropdown">
            {EXTRA.map(({ tool: t, icon: Icon, label, key }) => (
              <button
                key={t}
                className={tool === t ? "active" : ""}
                onClick={() => {
                  setTool(t);
                  setMoreOpen(false);
                }}
              >
                <Icon size={16} /> {label}
                <kbd>{key}</kbd>
              </button>
            ))}
            <div className="menu-divider" />
            <button
              onClick={() => {
                setUI({ templatesOpen: true });
                setMoreOpen(false);
              }}
            >
              <LayoutTemplate size={16} /> Templates…
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

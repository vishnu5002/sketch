import type { ReactNode } from "react";
import {
  AlignLeft,
  AlignCenter,
  AlignRight,
  BringToFront,
  SendToBack,
  ChevronUp,
  ChevronDown,
  Trash2,
  Copy,
  Group,
  Ungroup,
  ArrowRight,
  Spline,
  CornerDownRight,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Link2,
  Lock,
  BookPlus,
  FlipHorizontal2,
  FlipVertical2,
  Pipette,
  Globe,
  AlignVerticalJustifyStart,
  AlignVerticalJustifyCenter,
  AlignVerticalJustifyEnd,
} from "lucide-react";
import { useStore } from "../store";
import type { ArrowheadType, FillStyle, LineType, SketchElement, StrokeStyle, TextAlign, ToolType, VerticalAlign } from "../types";
import FontPicker from "./FontPicker";
import { isTextContainer } from "../utils/renderer";
import { addSelectionToLibrary } from "../actions";

const STROKE_COLORS = ["#1e1e1e", "#e03131", "#2f9e44", "#1971c2", "#f08c00", "#9c36b5"];
const BG_COLORS = ["transparent", "#ffc9c9", "#b2f2bb", "#a5d8ff", "#ffec99", "#eebefa"];

interface EyeDropperCtor {
  new (): { open: () => Promise<{ sRGBHex: string }> };
}

function Swatches({ colors, value, onChange }: { colors: string[]; value: string; onChange: (c: string) => void }) {
  const recent = useStore((s) => s.recentColors);
  const pushRecent = useStore((s) => s.pushRecentColor);
  const EyeDropper = (window as unknown as { EyeDropper?: EyeDropperCtor }).EyeDropper;
  const custom = (c: string) => {
    pushRecent(c);
    onChange(c);
  };
  const extras = recent.filter((c) => !colors.includes(c)).slice(0, 5);
  return (
    <div className="swatch-block">
      <div className="swatch-row">
        {colors.map((c) => (
          <button
            key={c}
            className={`swatch ${value.toLowerCase() === c.toLowerCase() ? "active" : ""} ${c === "transparent" ? "transparent" : ""}`}
            style={{ background: c === "transparent" ? undefined : c }}
            onClick={() => onChange(c)}
            title={c}
          />
        ))}
        <label className="swatch custom-swatch" title="Custom color" style={{ background: value === "transparent" ? undefined : value }}>
          <input type="color" value={value === "transparent" ? "#ffffff" : value} onChange={(e) => custom(e.target.value)} />
        </label>
        {EyeDropper && (
          <button
            className="swatch eyedropper"
            title="Pick a color from the screen"
            onClick={async () => {
              try {
                const r = await new EyeDropper().open();
                custom(r.sRGBHex);
              } catch {
                // user cancelled
              }
            }}
          >
            <Pipette size={13} />
          </button>
        )}
      </div>
      {extras.length > 0 && (
        <div className="swatch-row recent">
          {extras.map((c) => (
            <button key={c} className={`swatch small ${value.toLowerCase() === c.toLowerCase() ? "active" : ""}`} style={{ background: c }} onClick={() => onChange(c)} title={`Recent: ${c}`} />
          ))}
        </div>
      )}
    </div>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
}) {
  return (
    <div className="segmented">
      {options.map((o) => (
        <button key={String(o.value)} className={`segmented-btn ${value === o.value ? "active" : ""}`} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Section({ label, children, value }: { label: string; children: ReactNode; value?: ReactNode }) {
  return (
    <div className="style-section">
      <div className="style-label">
        {label} {value !== undefined && <span className="style-value">{value}</span>}
      </div>
      {children}
    </div>
  );
}

const ARROWHEADS: { value: ArrowheadType; label: string }[] = [
  { value: "none", label: "None" },
  { value: "arrow", label: "Arrow" },
  { value: "triangle", label: "Triangle" },
  { value: "dot", label: "Dot" },
  { value: "bar", label: "Bar" },
];

const DRAW_TOOLS: ToolType[] = ["rectangle", "diamond", "ellipse", "arrow", "line", "draw", "text", "sticky"];

export default function StylePanel() {
  const tool = useStore((s) => s.tool);
  const style = useStore((s) => s.style);
  const setStyle = useStore((s) => s.setStyle);
  const patchSelected = useStore((s) => s.patchSelected);
  const elements = useStore((s) => s.elements);
  const selectedIds = useStore((s) => s.selectedIds);
  const editingTextId = useStore((s) => s.editingTextId);
  const st = useStore.getState;

  const ids = new Set(selectedIds);
  const sel = elements.filter((e) => ids.has(e.id));
  const hasSelection = sel.length > 0;
  if (!hasSelection && !DRAW_TOOLS.includes(tool)) return null;

  const toolType = (tool === "sticky" ? "rectangle" : tool) as SketchElement["type"];
  const types = new Set(hasSelection ? sel.map((e) => e.type) : [toolType]);
  const first: Partial<SketchElement> = hasSelection ? sel[0] : style;
  const v = <K extends keyof SketchElement>(k: K) => (first[k] ?? (style as unknown as Partial<SketchElement>)[k]) as SketchElement[K];

  const has = (...t: SketchElement["type"][]) => t.some((x) => types.has(x));
  const only = (...t: SketchElement["type"][]) => [...types].every((x) => t.includes(x));
  const containersWithText = hasSelection && sel.some((e) => isTextContainer(e) && e.text);
  const shapes = has("rectangle", "diamond", "ellipse");
  const noStroke = only("image", "embed", "frame");
  const isTexty = has("text") || containersWithText || tool === "text" || tool === "sticky";

  return (
    <div className="style-panel" onPointerDown={(e) => e.stopPropagation()}>
      {!noStroke && (
        <Section label={only("text") ? "Text color" : "Stroke"}>
          <Swatches colors={STROKE_COLORS} value={v("strokeColor")} onChange={(c) => setStyle({ strokeColor: c })} />
        </Section>
      )}

      {shapes && (
        <Section label="Background">
          <Swatches colors={BG_COLORS} value={v("backgroundColor")} onChange={(c) => setStyle({ backgroundColor: c })} />
        </Section>
      )}

      {shapes && v("backgroundColor") !== "transparent" && (
        <Section label="Fill">
          <Segmented<FillStyle>
            value={v("fillStyle")}
            onChange={(x) => setStyle({ fillStyle: x })}
            options={[
              { value: "hachure", label: "Hachure" },
              { value: "cross-hatch", label: "Cross" },
              { value: "solid", label: "Solid" },
            ]}
          />
        </Section>
      )}

      {!noStroke && !only("text") && (
        <Section label="Stroke width">
          <Segmented<number>
            value={v("strokeWidth")}
            onChange={(x) => setStyle({ strokeWidth: x })}
            options={[
              { value: 1, label: <span className="stroke-sample" style={{ height: 1 }} />, title: "Thin" },
              { value: 2, label: <span className="stroke-sample" style={{ height: 2 }} />, title: "Bold" },
              { value: 4, label: <span className="stroke-sample" style={{ height: 4 }} />, title: "Extra bold" },
            ]}
          />
        </Section>
      )}

      {!noStroke && !only("text", "draw") && (
        <Section label="Stroke style">
          <Segmented<StrokeStyle>
            value={v("strokeStyle")}
            onChange={(x) => setStyle({ strokeStyle: x })}
            options={[
              { value: "solid", label: "Solid" },
              { value: "dashed", label: "Dashed" },
              { value: "dotted", label: "Dotted" },
            ]}
          />
        </Section>
      )}

      {!noStroke && !only("text") && (
        <Section label="Sloppiness">
          <Segmented<number>
            value={v("roughness")}
            onChange={(x) => setStyle({ roughness: x })}
            options={[
              { value: 0, label: "Architect" },
              { value: 1, label: "Artist" },
              { value: 2, label: "Cartoon" },
            ]}
          />
        </Section>
      )}

      {has("rectangle", "diamond") && (
        <Section label="Edges">
          <Segmented<string>
            value={v("roundness") ? "round" : "sharp"}
            onChange={(x) => setStyle({ roundness: x === "round" })}
            options={[
              { value: "sharp", label: "Sharp" },
              { value: "round", label: "Round" },
            ]}
          />
        </Section>
      )}

      {has("line", "arrow") && (
        <Section label="Line type">
          <Segmented<LineType>
            value={v("lineType") ?? "straight"}
            onChange={(x) => setStyle({ lineType: x })}
            options={[
              { value: "straight", label: <ArrowRight size={14} />, title: "Straight" },
              { value: "curved", label: <Spline size={14} />, title: "Curved (drag a midpoint handle to bend)" },
              { value: "elbow", label: <CornerDownRight size={14} />, title: "Elbow" },
            ]}
          />
        </Section>
      )}

      {has("arrow") && (
        <Section label="Arrowheads">
          <div className="arrowhead-row">
            <select value={v("startArrowhead") ?? "none"} onChange={(e) => setStyle({ startArrowhead: e.target.value as ArrowheadType })} title="Start">
              {ARROWHEADS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
            <select value={v("endArrowhead") ?? "arrow"} onChange={(e) => setStyle({ endArrowhead: e.target.value as ArrowheadType })} title="End">
              {ARROWHEADS.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </Section>
      )}

      {isTexty && (
        <>
          {containersWithText && (
            <Section label="Text color">
              <Swatches colors={STROKE_COLORS} value={v("textColor") ?? v("strokeColor")} onChange={(c) => patchSelected({ textColor: c })} />
            </Section>
          )}
          <Section label="Font family">
            <FontPicker value={v("fontFamily") ?? style.fontFamily} onChange={(f) => setStyle({ fontFamily: f })} />
          </Section>
          <Section label="Font size">
            <div className="font-size-row">
              <Segmented<number>
                value={v("fontSize") ?? 20}
                onChange={(x) => setStyle({ fontSize: x })}
                options={[
                  { value: 16, label: "S" },
                  { value: 20, label: "M" },
                  { value: 28, label: "L" },
                  { value: 36, label: "XL" },
                ]}
              />
              <input
                type="number"
                className="num-input"
                min={6}
                max={400}
                value={Math.round(v("fontSize") ?? 20)}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  if (n >= 6 && n <= 400) setStyle({ fontSize: n });
                }}
              />
            </div>
          </Section>
          <Section label="Text">
            <div className="segmented">
              <button className={`segmented-btn ${v("fontWeight") === "bold" ? "active" : ""}`} title="Bold" onClick={() => setStyle({ fontWeight: v("fontWeight") === "bold" ? "normal" : "bold" })}>
                <Bold size={14} />
              </button>
              <button className={`segmented-btn ${v("fontStyle") === "italic" ? "active" : ""}`} title="Italic" onClick={() => setStyle({ fontStyle: v("fontStyle") === "italic" ? "normal" : "italic" })}>
                <Italic size={14} />
              </button>
              <button
                className={`segmented-btn ${v("textDecoration") === "underline" ? "active" : ""}`}
                title="Underline"
                onClick={() => setStyle({ textDecoration: v("textDecoration") === "underline" ? "none" : "underline" })}
              >
                <Underline size={14} />
              </button>
              <button
                className={`segmented-btn ${v("textDecoration") === "line-through" ? "active" : ""}`}
                title="Strikethrough"
                onClick={() => setStyle({ textDecoration: v("textDecoration") === "line-through" ? "none" : "line-through" })}
              >
                <Strikethrough size={14} />
              </button>
            </div>
            <Segmented<TextAlign>
              value={v("textAlign") ?? (has("text") ? "left" : "center")}
              onChange={(x) => setStyle({ textAlign: x })}
              options={[
                { value: "left", label: <AlignLeft size={14} />, title: "Left" },
                { value: "center", label: <AlignCenter size={14} />, title: "Center" },
                { value: "right", label: <AlignRight size={14} />, title: "Right" },
              ]}
            />
            {containersWithText && (
              <Segmented<VerticalAlign>
                value={v("verticalAlign") ?? "middle"}
                onChange={(x) => patchSelected({ verticalAlign: x })}
                options={[
                  { value: "top", label: <AlignVerticalJustifyStart size={14} />, title: "Top" },
                  { value: "middle", label: <AlignVerticalJustifyCenter size={14} />, title: "Middle" },
                  { value: "bottom", label: <AlignVerticalJustifyEnd size={14} />, title: "Bottom" },
                ]}
              />
            )}
          </Section>
        </>
      )}

      {hasSelection && sel.length === 1 && sel[0].type === "frame" && (
        <Section label="Frame name">
          <input
            className="text-input"
            value={sel[0].name ?? ""}
            onChange={(e) => patchSelected({ name: e.target.value })}
            onKeyDown={(e) => e.stopPropagation()}
          />
        </Section>
      )}

      {hasSelection && sel.length === 1 && sel[0].type === "embed" && (
        <Section label="Embedded URL">
          <button className="wide-btn" onClick={() => st().setUI({ linkEditor: { elementId: sel[0].id, mode: "embed" } })}>
            <Globe size={14} /> {sel[0].link ? "Change URL…" : "Set URL…"}
          </button>
        </Section>
      )}

      {!only("frame") && (
        <Section label="Opacity" value={v("opacity")}>
          <input type="range" min={0} max={100} step={5} value={v("opacity")} onChange={(e) => setStyle({ opacity: Number(e.target.value) })} />
        </Section>
      )}

      {hasSelection && !editingTextId && (
        <>
          <Section label="Layers">
            <div className="icon-row">
              <button title="Send to back (Ctrl+Shift+[)" onClick={() => st().sendToBack(selectedIds)}>
                <SendToBack size={16} />
              </button>
              <button title="Send backward (Ctrl+[)" onClick={() => st().sendBackward(selectedIds)}>
                <ChevronDown size={16} />
              </button>
              <button title="Bring forward (Ctrl+])" onClick={() => st().bringForward(selectedIds)}>
                <ChevronUp size={16} />
              </button>
              <button title="Bring to front (Ctrl+Shift+])" onClick={() => st().bringToFront(selectedIds)}>
                <BringToFront size={16} />
              </button>
            </div>
          </Section>
          <Section label="Actions">
            <div className="icon-row wrap">
              <button title="Duplicate (Ctrl+D)" onClick={() => st().duplicateSelected()}>
                <Copy size={16} />
              </button>
              {sel.length > 1 && (
                <button title="Group (Ctrl+G)" onClick={() => st().groupSelected()}>
                  <Group size={16} />
                </button>
              )}
              {sel.some((e) => e.groupId) && (
                <button title="Ungroup (Ctrl+Shift+G)" onClick={() => st().ungroupSelected()}>
                  <Ungroup size={16} />
                </button>
              )}
              {sel.length === 1 && sel[0].type !== "embed" && (
                <button className={sel[0].link ? "on" : ""} title="Link (Ctrl+K)" onClick={() => st().setUI({ linkEditor: { elementId: sel[0].id, mode: "link" } })}>
                  <Link2 size={16} />
                </button>
              )}
              <button title="Flip horizontal (Shift+H)" onClick={() => st().flipSelected("x")}>
                <FlipHorizontal2 size={16} />
              </button>
              <button title="Flip vertical (Shift+V)" onClick={() => st().flipSelected("y")}>
                <FlipVertical2 size={16} />
              </button>
              <button title="Lock (Ctrl+Shift+L)" onClick={() => st().toggleLock(selectedIds)}>
                <Lock size={16} />
              </button>
              <button title="Add to library (Alt+L)" onClick={addSelectionToLibrary}>
                <BookPlus size={16} />
              </button>
              <button className="danger" title="Delete (Del)" onClick={() => st().deleteElements(selectedIds)}>
                <Trash2 size={16} />
              </button>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}

export type ToolType =
  | "selection"
  | "pan"
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "draw"
  | "text"
  | "image"
  | "eraser"
  | "frame"
  | "embed"
  | "sticky"
  | "laser";

export type FillStyle = "hachure" | "cross-hatch" | "solid" | "none";
export type StrokeStyle = "solid" | "dashed" | "dotted";
/** Any font family name — bundled (e.g. "Excalifont") or a Google Fonts family. */
export type FontFamily = string;
export type TextAlign = "left" | "center" | "right";
export type FontWeight = "normal" | "bold";
export type FontStyle = "normal" | "italic";
export type TextDecoration = "none" | "underline" | "line-through";
export type ArrowheadType = "none" | "arrow" | "triangle" | "dot" | "bar";
export type LineType = "straight" | "curved" | "elbow";
export type ElementType =
  | "rectangle"
  | "diamond"
  | "ellipse"
  | "arrow"
  | "line"
  | "draw"
  | "text"
  | "image"
  | "frame"
  | "embed";

export type VerticalAlign = "top" | "middle" | "bottom";

export interface TextLink {
  start: number;
  end: number;
  url: string;
}

export interface Binding {
  elementId: string;
}

export interface SketchElement {
  id: string;
  type: ElementType;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;

  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  roundness: boolean;
  opacity: number;
  seed: number;
  groupId: string | null;

  link?: string | null;
  locked?: boolean;
  frameId?: string | null;

  // linear (line / arrow)
  points?: [number, number][];
  startArrowhead?: ArrowheadType;
  endArrowhead?: ArrowheadType;
  lineType?: LineType;
  startBinding?: Binding | null;
  endBinding?: Binding | null;
  /** Elbow routing direction chosen at bind time: leave/enter horizontally or vertically. */
  elbowDir?: "h" | "v";

  // draw (freehand)
  pressures?: number[];

  // text — standalone text elements, and text inside rectangle/diamond/ellipse
  text?: string;
  /** Hyperlinks on character ranges of `text` ([start, end) offsets). */
  textLinks?: TextLink[];
  verticalAlign?: VerticalAlign;
  textColor?: string;
  fontFamily?: FontFamily;
  fontSize?: number;
  textAlign?: TextAlign;
  fontWeight?: FontWeight;
  fontStyle?: FontStyle;
  textDecoration?: TextDecoration;

  // image
  src?: string;
  naturalWidth?: number;
  naturalHeight?: number;
  flipX?: boolean;
  flipY?: boolean;

  // frame
  name?: string;
}

export interface Style {
  strokeColor: string;
  backgroundColor: string;
  fillStyle: FillStyle;
  strokeWidth: number;
  strokeStyle: StrokeStyle;
  roughness: number;
  roundness: boolean;
  opacity: number;
  fontFamily: FontFamily;
  fontSize: number;
  textAlign: TextAlign;
  fontWeight: FontWeight;
  fontStyle: FontStyle;
  textDecoration: TextDecoration;
  lineType: LineType;
  startArrowhead: ArrowheadType;
  endArrowhead: ArrowheadType;
}

export interface Viewport {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

export type Theme = "light" | "dark";

export interface Point {
  x: number;
  y: number;
}

export interface Bounds {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface Page {
  id: string;
  name: string;
  elements: SketchElement[];
  viewport?: Viewport;
}

export interface LibraryItem {
  id: string;
  name: string;
  elements: SketchElement[];
  created: number;
}

export interface DocumentFile {
  type: "sketchboard";
  version: 2;
  pages: Page[];
  activePageId: string;
  canvasBg?: string;
}

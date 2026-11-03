import type { ElementType, SketchElement } from "../types";
import { makeId, randomSeed } from "./id";
import { refit } from "../store";

type Extra = Partial<SketchElement>;

function el(type: ElementType, x: number, y: number, width: number, height: number, extra: Extra = {}): SketchElement {
  return refit({
    id: makeId(),
    type,
    x,
    y,
    width,
    height,
    angle: 0,
    strokeColor: "#1e1e1e",
    backgroundColor: "transparent",
    fillStyle: "solid",
    strokeWidth: 2,
    strokeStyle: "solid",
    roughness: 1,
    roundness: true,
    opacity: 100,
    seed: randomSeed(),
    groupId: null,
    fontFamily: "Excalifont",
    fontSize: 20,
    textAlign: type === "text" ? "left" : "center",
    ...extra,
  });
}

function arrow(from: SketchElement, to: SketchElement, extra: Extra = {}): SketchElement {
  const a = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const b = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  return el("arrow", Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y), {
    points: [
      [a.x - Math.min(a.x, b.x), a.y - Math.min(a.y, b.y)],
      [b.x - Math.min(a.x, b.x), b.y - Math.min(a.y, b.y)],
    ],
    startArrowhead: "none",
    endArrowhead: "arrow",
    lineType: "straight",
    startBinding: { elementId: from.id },
    endBinding: { elementId: to.id },
    ...extra,
  });
}

const sticky = (x: number, y: number, text: string, bg = "#ffec99", w = 180, h = 120) =>
  el("rectangle", x, y, w, h, { backgroundColor: bg, strokeColor: "#1e1e1e", strokeWidth: 1, roughness: 0, text, fontSize: 18 });

function flowchart(): SketchElement[] {
  const start = el("ellipse", 120, 0, 180, 80, { text: "Start", backgroundColor: "#b2f2bb" });
  const step = el("rectangle", 110, 150, 200, 90, { text: "Do the thing", backgroundColor: "#a5d8ff" });
  const decide = el("diamond", 100, 320, 220, 140, { text: "Worked?", backgroundColor: "#ffec99" });
  const done = el("ellipse", 120, 540, 180, 80, { text: "Done", backgroundColor: "#b2f2bb" });
  const fix = el("rectangle", 440, 345, 180, 90, { text: "Fix it", backgroundColor: "#ffc9c9" });
  const yes = el("text", 225, 480, 40, 25, { text: "yes", fontSize: 16 });
  const no = el("text", 350, 360, 40, 25, { text: "no", fontSize: 16 });
  return [start, step, decide, done, fix, arrow(start, step), arrow(step, decide), arrow(decide, done), arrow(decide, fix), arrow(fix, step, { lineType: "elbow" }), yes, no];
}

function kanban(): SketchElement[] {
  const cols = ["To do", "In progress", "Done"];
  const colors = ["#ffec99", "#a5d8ff", "#b2f2bb"];
  const out: SketchElement[] = [];
  cols.forEach((name, i) => {
    const x = i * 260;
    const frame = el("frame", x, 0, 230, 480, { name, strokeColor: "#bbb", roughness: 0, fontFamily: undefined });
    out.push(frame);
    const cards = i === 0 ? ["Research", "Write spec", "Design"] : i === 1 ? ["Build MVP", "Review"] : ["Kickoff"];
    cards.forEach((c, j) => out.push({ ...sticky(x + 25, 25 + j * 145, c, colors[i]), frameId: frame.id }));
  });
  return out;
}

function mindmap(): SketchElement[] {
  const center = el("ellipse", 300, 200, 220, 110, { text: "Main idea", backgroundColor: "#d0bfff", fontSize: 24 });
  const topics = ["Goals", "People", "Risks", "Timeline", "Budget", "Ideas"];
  const out: SketchElement[] = [center];
  topics.forEach((t, i) => {
    const a = (i / topics.length) * Math.PI * 2 - Math.PI / 2;
    const node = el("rectangle", 410 + Math.cos(a) * 330 - 75, 255 + Math.sin(a) * 210 - 30, 150, 60, { text: t, backgroundColor: "#e9ecef" });
    out.push(node, arrow(center, node, { endArrowhead: "none", roughness: 1.5 }));
  });
  return out;
}

function wireframe(): SketchElement[] {
  const frame = el("frame", 0, 0, 360, 720, { name: "Mobile screen", roughness: 0 });
  const kids: SketchElement[] = [
    el("rectangle", 0, 0, 360, 64, { backgroundColor: "#e9ecef", roundness: false, roughness: 0, strokeWidth: 1 }),
    el("text", 20, 20, 100, 25, { text: "App title", fontFamily: "Nunito", fontWeight: "bold" }),
    el("rectangle", 20, 90, 320, 200, { roughness: 0, strokeWidth: 1 }),
    el("line", 20, 90, 320, 200, { points: [[0, 0], [320, 200]], roughness: 0, strokeWidth: 1, strokeColor: "#adb5bd" }),
    el("line", 20, 90, 320, 200, { points: [[320, 0], [0, 200]], roughness: 0, strokeWidth: 1, strokeColor: "#adb5bd" }),
    el("text", 20, 310, 200, 30, { text: "Headline goes here", fontFamily: "Nunito", fontSize: 22, fontWeight: "bold" }),
    el("text", 20, 350, 300, 75, { text: "Some supporting copy that\nexplains what this screen\nis for.", fontFamily: "Nunito", fontSize: 16, strokeColor: "#495057" }),
    el("rectangle", 20, 600, 320, 56, { backgroundColor: "#4c6ef5", strokeColor: "#4c6ef5", roughness: 0, text: "Continue", textColor: "#ffffff", fontFamily: "Nunito", fontWeight: "bold" }),
  ];
  return [frame, ...kids.map((k) => ({ ...k, frameId: frame.id }))];
}

function brainstorm(): SketchElement[] {
  const colors = ["#ffec99", "#ffc9c9", "#a5d8ff", "#b2f2bb", "#eebefa", "#ffd8a8"];
  const title = el("text", 0, -70, 300, 40, { text: "Brainstorm: ___", fontSize: 32, fontWeight: "bold" });
  return [title, ...colors.map((c, i) => sticky((i % 3) * 210, Math.floor(i / 3) * 170, "Idea " + (i + 1), c, 190, 150))];
}

function timeline(): SketchElement[] {
  const line = el("arrow", 0, 100, 900, 1, { points: [[0, 0], [900, 0]], startArrowhead: "none", endArrowhead: "arrow", strokeWidth: 3 });
  const out: SketchElement[] = [line];
  ["Kickoff", "Design", "Build", "Beta", "Launch"].forEach((label, i) => {
    const x = 60 + i * 190;
    out.push(el("ellipse", x - 12, 88, 24, 24, { backgroundColor: "#4c6ef5", strokeColor: "#4c6ef5", roughness: 0 }));
    out.push(el("text", x - 40, i % 2 ? 130 : 40, 80, 25, { text: label, textAlign: "center" }));
  });
  return out;
}

export const TEMPLATES: { id: string; name: string; description: string; build: () => SketchElement[] }[] = [
  { id: "flowchart", name: "Flowchart", description: "Start, process, decision with connected arrows", build: flowchart },
  { id: "kanban", name: "Kanban board", description: "Three frames with sticky-note cards", build: kanban },
  { id: "mindmap", name: "Mind map", description: "Central idea with six connected branches", build: mindmap },
  { id: "wireframe", name: "Mobile wireframe", description: "Phone-sized frame with a basic layout", build: wireframe },
  { id: "brainstorm", name: "Brainstorm", description: "A grid of colorful sticky notes", build: brainstorm },
  { id: "timeline", name: "Timeline", description: "Milestones along an arrow", build: timeline },
];

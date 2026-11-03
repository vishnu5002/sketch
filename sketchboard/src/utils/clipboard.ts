import type { SketchElement } from "../types";

const CLIP_TYPE = "sketchboard/clipboard";
let memory: SketchElement[] | null = null;

export interface ClipboardPayload {
  elements?: SketchElement[];
  text?: string;
  files?: File[];
}

export function serializeElements(els: SketchElement[]): string {
  memory = els.map((e) => ({ ...e }));
  return JSON.stringify({ type: CLIP_TYPE, elements: els });
}

function parseElements(text: string): SketchElement[] | null {
  try {
    const d = JSON.parse(text);
    if (d?.type === CLIP_TYPE && Array.isArray(d.elements)) return d.elements;
  } catch {
    // plain text, not ours
  }
  return null;
}

function fromText(text: string): ClipboardPayload {
  const els = parseElements(text);
  return els ? { elements: els } : { text };
}

export async function writeElementsToClipboard(els: SketchElement[]): Promise<void> {
  const json = serializeElements(els);
  try {
    await navigator.clipboard.writeText(json);
  } catch {
    // the in-memory copy still lets paste work inside this tab
  }
}

export function payloadFromEvent(e: ClipboardEvent): ClipboardPayload {
  const dt = e.clipboardData;
  if (!dt) return {};
  const files = Array.from(dt.files).filter((f) => f.type.startsWith("image/"));
  if (files.length) return { files };
  const text = dt.getData("text/plain");
  return text ? fromText(text) : {};
}

/** Used by the context menu, where no native paste event is available. */
export async function readClipboard(): Promise<ClipboardPayload> {
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith("image/"));
      if (imageType) {
        const blob = await item.getType(imageType);
        return { files: [new File([blob], "pasted", { type: imageType })] };
      }
      if (item.types.includes("text/plain")) {
        return fromText(await (await item.getType("text/plain")).text());
      }
    }
  } catch {
    try {
      const text = await navigator.clipboard.readText();
      if (text) return fromText(text);
    } catch {
      // permission denied — fall back to what we copied in this tab
    }
  }
  return memory ? { elements: memory } : {};
}

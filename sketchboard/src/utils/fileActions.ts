// .json files are how drawings travel: Open imports them as projects, Save as exports one.
import { projectsApi, type ProjectMeta } from "../api";
import { createAndOpen, flushSave, openInEditor, saveCheckpoint } from "../project";
import { useStore } from "../store";
import type { DocumentFile } from "../types";
import { downloadBlob, parseDocument, readFileAsText } from "./exportScene";

interface WritableHandle {
  createWritable: () => Promise<{ write: (data: Blob) => Promise<void>; close: () => Promise<void> }>;
}
interface FilePickerWindow {
  showSaveFilePicker?: (opts: unknown) => Promise<WritableHandle>;
}

const PICKER_TYPES = [{ description: "Sketchboard drawing", accept: { "application/json": [".json"] } }];

const st = () => useStore.getState();
const toast = (m: string) => st().showToast(m);

export function pickFiles(accept: string, multiple = false): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve(Array.from(input.files ?? []));
    input.addEventListener("cancel", () => resolve([]));
    input.click();
  });
}

export const pickFile = async (accept: string) => (await pickFiles(accept))[0] ?? null;

export const nameFromFile = (fileName: string) => fileName.replace(/(\.sketchboard)?\.json$/i, "") || "Imported drawing";

function asDocument(parsed: ReturnType<typeof parseDocument>): DocumentFile {
  if ("pages" in parsed) return parsed;
  const id = crypto.randomUUID();
  return { type: "sketchboard", version: 2, pages: [{ id, name: "Page 1", elements: parsed.elements }], activePageId: id };
}

/** Import .json files as new projects. Returns the ones that worked. */
export async function importFiles(files: File[]): Promise<ProjectMeta[]> {
  const done: ProjectMeta[] = [];
  const failed: string[] = [];
  for (const f of files) {
    try {
      done.push(await projectsApi.import(nameFromFile(f.name), asDocument(parseDocument(await readFileAsText(f)))));
    } catch {
      failed.push(f.name);
    }
  }
  if (failed.length) toast(`Couldn't import ${failed.join(", ")} — is it a sketchboard drawing?`);
  else if (done.length > 1) toast(`Imported ${done.length} drawings`);
  return done;
}

/** Ctrl+O: import one or more files and open the first. */
export async function openDocument() {
  const files = await pickFiles(".json,application/json", true);
  if (!files.length) return;
  const done = await importFiles(files);
  if (done[0]) {
    openInEditor(done[0].id);
    if (done.length === 1) toast(`Imported ${files[0].name}`);
  }
}

export async function newDocument() {
  await createAndOpen("Untitled drawing");
}

/** Ctrl+S saves (and marks a checkpoint); Ctrl+Shift+S exports a portable .json. */
export async function saveDocument(saveAs = false) {
  if (saveAs) await exportJson();
  else await saveCheckpoint();
}

/** Download the open project as a self-contained .json (images embedded). */
export async function exportJson(id = st().project?.id, name = st().project?.name) {
  if (!id) return;
  if (id === st().project?.id) await flushSave();
  const fileName = `${(name ?? "drawing").replace(/[\\/:*?"<>|]+/g, "_")}.sketchboard.json`;
  let blob: Blob;
  try {
    const res = await fetch(projectsApi.exportUrl(id), { headers: { "X-Sketchboard": "1" } });
    if (!res.ok) throw new Error();
    blob = await res.blob();
  } catch {
    toast("Couldn't export — is the sketchboard service running?");
    return;
  }
  const picker = (window as unknown as FilePickerWindow).showSaveFilePicker;
  if (picker) {
    try {
      const handle = await picker({ suggestedName: fileName, types: PICKER_TYPES });
      const w = await handle.createWritable();
      await w.write(blob);
      await w.close();
      toast(`Exported ${fileName}`);
      return;
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return;
    }
  }
  downloadBlob(blob, fileName);
  toast(`Downloaded ${fileName}`);
}

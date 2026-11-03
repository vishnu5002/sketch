import { useEffect, useMemo, useState } from "react";
import { X, Download, Copy } from "lucide-react";
import { useStore } from "../store";
import { copyPNGToClipboard, copySVGToClipboard, downloadBlob, exportToPNGBlob, exportToSVGString, renderElementsToCanvas } from "../utils/exportScene";

export default function ExportDialog() {
  const open = useStore((s) => s.exportOpen);
  if (!open) return null;
  return <Dialog />;
}

function Dialog() {
  const elements = useStore((s) => s.elements);
  const selectedIds = useStore((s) => s.selectedIds);
  const theme = useStore((s) => s.theme);
  const canvasBg = useStore((s) => s.canvasBg);
  const st = useStore.getState;

  const [format, setFormat] = useState<"png" | "svg">("png");
  const [scale, setScale] = useState(2);
  const [background, setBackground] = useState(true);
  const [dark, setDark] = useState(theme === "dark");
  const [onlySelected, setOnlySelected] = useState(selectedIds.length > 0);
  const [name, setName] = useState("drawing");
  const [preview, setPreview] = useState<string | null>(null);

  const targets = useMemo(() => {
    if (!onlySelected) return elements;
    const ids = new Set(selectedIds);
    const frameIds = new Set(elements.filter((e) => ids.has(e.id) && e.type === "frame").map((e) => e.id));
    return elements.filter((e) => ids.has(e.id) || (e.frameId && frameIds.has(e.frameId)));
  }, [elements, selectedIds, onlySelected]);

  const opts = { background: background ? canvasBg : null, scale, dark };

  useEffect(() => {
    let cancelled = false;
    if (!targets.length) {
      setPreview(null);
      return;
    }
    renderElementsToCanvas(targets, { ...opts, scale: 1 }).then((c) => !cancelled && setPreview(c.toDataURL()));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, background, dark, canvasBg]);

  const close = () => st().setUI({ exportOpen: false });
  const fileName = (name.trim() || "drawing") + "." + format;

  const download = async () => {
    if (format === "png") downloadBlob(await exportToPNGBlob(targets, opts), fileName);
    else downloadBlob(new Blob([await exportToSVGString(targets, opts)], { type: "image/svg+xml" }), fileName);
    st().showToast(`Exported ${fileName}`);
  };

  const copy = async () => {
    try {
      if (format === "png") await copyPNGToClipboard(targets, opts);
      else await copySVGToClipboard(targets, opts);
      st().showToast(format === "png" ? "PNG copied to clipboard" : "SVG markup copied to clipboard");
    } catch {
      st().showToast("Clipboard access was blocked by the browser");
    }
  };

  return (
    <div className="modal-backdrop" onPointerDown={close}>
      <div className="modal export-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Export image</h2>
          <button onClick={close} title="Close">
            <X size={18} />
          </button>
        </div>
        <div className="export-body">
          <div className={`export-preview ${background ? "" : "checker"}`}>{preview ? <img src={preview} alt="Export preview" /> : <span className="muted">Nothing to export</span>}</div>
          <div className="export-options">
            <label className="field">
              <span>File name</span>
              <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.stopPropagation()} />
            </label>
            <div className="field">
              <span>Format</span>
              <div className="segmented">
                {(["png", "svg"] as const).map((f) => (
                  <button key={f} className={`segmented-btn ${format === f ? "active" : ""}`} onClick={() => setFormat(f)}>
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            {format === "png" && (
              <div className="field">
                <span>Scale</span>
                <div className="segmented">
                  {[1, 2, 3, 4].map((n) => (
                    <button key={n} className={`segmented-btn ${scale === n ? "active" : ""}`} onClick={() => setScale(n)}>
                      {n}×
                    </button>
                  ))}
                </div>
              </div>
            )}
            <label className="toggle">
              <input type="checkbox" checked={background} onChange={(e) => setBackground(e.target.checked)} /> Background
            </label>
            <label className="toggle">
              <input type="checkbox" checked={dark} onChange={(e) => setDark(e.target.checked)} /> Dark mode
            </label>
            <label className="toggle">
              <input type="checkbox" checked={onlySelected} disabled={!selectedIds.length} onChange={(e) => setOnlySelected(e.target.checked)} /> Only selected
            </label>
            <div className="export-actions">
              <button className="primary" disabled={!targets.length} onClick={download}>
                <Download size={15} /> Download
              </button>
              <button disabled={!targets.length} onClick={copy}>
                <Copy size={15} /> Copy
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

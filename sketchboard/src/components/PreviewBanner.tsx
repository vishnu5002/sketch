import { History, RotateCcw, CopyPlus, ArrowLeft } from "lucide-react";
import { useStore } from "../store";
import { copyPreviewPageToCurrent, exitPreview, restoreVersion } from "../utils/versions";

export default function PreviewBanner() {
  const preview = useStore((s) => s.preview);
  const versions = useStore((s) => s.versions);
  if (!preview) return null;
  const v = versions.find((x) => x.id === preview.versionId);
  const when = v ? new Date(v.created).toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";

  return (
    <div className="preview-banner">
      <span className="preview-label">
        <History size={15} />
        <span>
          Viewing version · <b>{v?.label ?? when}</b>
          {v?.label && <span className="muted"> · {when}</span>}
        </span>
      </span>
      <div className="toolbar-divider" />
      <button onClick={() => restoreVersion(preview.versionId)} className="preview-restore" title="Make this version the current drawing (your current one is saved as a version first)">
        <RotateCcw size={14} /> Restore
      </button>
      <button onClick={copyPreviewPageToCurrent} title="Copy just this page into the current drawing as a new page">
        <CopyPlus size={14} /> Copy page
      </button>
      <button onClick={exitPreview} title="Back to the current drawing (Esc)">
        <ArrowLeft size={14} /> Back
      </button>
    </div>
  );
}

import { ArrowLeft, Crosshair, FileText } from "lucide-react";
import { useStore } from "../store";
import { finishLinkPick, navigateBack, pickHere } from "../linkNav";

/** While choosing a link target: what to do. After following a link: the way back. */
export default function LinkNavBar() {
  const pick = useStore((s) => s.linkPick);
  const navBack = useStore((s) => s.navBack);
  const preview = useStore((s) => s.preview);

  if (pick)
    return (
      <div className="link-nav-bar" role="status">
        <Crosshair size={15} />
        <span>Click what to link to — any page</span>
        <button onClick={() => pickHere(null)} title="Link to the page you're looking at">
          <FileText size={14} /> This page
        </button>
        <button onClick={() => finishLinkPick(null)} title="Cancel (Esc)">
          Cancel
        </button>
      </div>
    );

  if (navBack && !preview)
    return (
      <div className="link-nav-bar back">
        <button onClick={navigateBack} title="Back to where you followed the link from (Alt+←)">
          <ArrowLeft size={14} /> Back to {navBack}
        </button>
      </div>
    );

  return null;
}

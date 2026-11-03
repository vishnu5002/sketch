import { useMemo } from "react";
import { X } from "lucide-react";
import { useStore } from "../store";
import { TEMPLATES } from "../utils/templates";
import { cloneElements } from "../utils/clone";
import { getCommonBounds } from "../utils/geometry";
import { sceneCenter, zoomToSelection } from "../actions";
import Thumbnail from "./Thumbnail";

export default function TemplatesModal() {
  const open = useStore((s) => s.templatesOpen);
  if (!open) return null;
  return <Modal />;
}

function Modal() {
  const theme = useStore((s) => s.theme);
  const built = useMemo(() => TEMPLATES.map((t) => ({ ...t, elements: t.build() })), []);
  const st = useStore.getState;
  const close = () => st().setUI({ templatesOpen: false });

  const insert = (els: ReturnType<(typeof TEMPLATES)[number]["build"]>) => {
    const b = getCommonBounds(els)!;
    const c = sceneCenter();
    st().insertElements(cloneElements(els, c.x - (b.x1 + b.x2) / 2, c.y - (b.y1 + b.y2) / 2));
    st().setTool("selection");
    close();
    requestAnimationFrame(zoomToSelection);
  };

  return (
    <div className="modal-backdrop" onPointerDown={close}>
      <div className="modal templates-modal" onPointerDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Templates</h2>
          <button onClick={close} title="Close">
            <X size={18} />
          </button>
        </div>
        <div className="templates-grid">
          {built.map((t) => (
            <button key={t.id} className="template-card" onClick={() => insert(t.elements)}>
              <div className="template-thumb">
                <Thumbnail elements={t.elements} size={160} dark={theme === "dark"} />
              </div>
              <b>{t.name}</b>
              <span>{t.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

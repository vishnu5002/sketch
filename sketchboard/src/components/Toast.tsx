import { useEffect } from "react";
import { useStore } from "../store";

export default function Toast() {
  const toast = useStore((s) => s.toast);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => {
      if (useStore.getState().toast?.id === toast.id) useStore.setState({ toast: null });
    }, 2600);
    return () => clearTimeout(t);
  }, [toast]);
  if (!toast) return null;
  return (
    <div className="toast" key={toast.id} role="status">
      {toast.message}
    </div>
  );
}

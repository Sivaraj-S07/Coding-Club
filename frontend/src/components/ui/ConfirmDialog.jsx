import { useEffect } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle } from "lucide-react";
import Button from "./Button";

/**
 * Same portal treatment as Modal: confirm dialogs are opened from inside
 * blurred glass cards, which would otherwise clip a `fixed` overlay.
 */
export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onCancel?.();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[1010] flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" onClick={onCancel} />
      <div className="glass-panel relative z-[1] w-full max-w-sm bg-[#0b0e22] p-6 shadow-2xl shadow-black/60 animate-[popIn_0.2s_ease]">
        <div className={`flex h-11 w-11 items-center justify-center rounded-xl ${tone === "danger" ? "bg-coral/10" : "bg-electric/10"}`}>
          <AlertTriangle className={`h-5 w-5 ${tone === "danger" ? "text-coral" : "text-electric-light"}`} />
        </div>
        <h3 className="mt-4 font-display text-lg font-semibold text-ink-100">{title}</h3>
        {description && <p className="mt-1.5 text-sm text-ink-500 leading-relaxed">{description}</p>}
        <div className="mt-6 flex gap-3">
          <Button variant="secondary" size="md" className="flex-1" onClick={onCancel}>
            {cancelLabel}
          </Button>
          <Button variant={tone === "danger" ? "danger" : "primary"} size="md" className="flex-1" onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </div>
      </div>
      <style>{`
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.96) translateY(6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  );
}

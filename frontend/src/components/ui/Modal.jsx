import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";

/**
 * Modals are rendered through a portal on <body>. Admin pages are full of
 * `backdrop-blur` glass panels, and a blurred/transformed ancestor becomes the
 * containing block for `position: fixed` children — which used to clip the
 * modal or trap it below the page chrome. Portalling out plus a top-level
 * z-index guarantees it always paints above everything else.
 */
export default function Modal({ open, title, onClose, children, maxWidth = "max-w-lg" }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") onClose?.();
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={typeof title === "string" ? title : undefined}
      className="fixed inset-0 z-[1000] flex items-start justify-center overflow-y-auto overscroll-contain p-4 py-10"
    >
      <div className="fixed inset-0 bg-black/75 backdrop-blur-sm" onClick={onClose} />
      <div
        className={`glass-panel relative z-[1] my-auto w-full ${maxWidth} max-h-[90vh] overflow-y-auto bg-[#0b0e22] p-6 shadow-2xl shadow-black/60 animate-[popIn_0.2s_ease]`}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-ink-100">{title}</h3>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="shrink-0 rounded-lg p-1 text-ink-500 transition-colors hover:bg-white/10 hover:text-ink-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
      <style>{`
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.97) translateY(6px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>,
    document.body
  );
}

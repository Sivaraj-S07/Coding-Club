import { createContext, useCallback, useContext, useState } from "react";
import { CheckCircle2, AlertTriangle, Info, XCircle, X } from "lucide-react";

const ToastContext = createContext(null);

const icons = {
  success: CheckCircle2,
  warning: AlertTriangle,
  info: Info,
  error: XCircle,
};

const iconColor = {
  success: "text-mint",
  warning: "text-amber",
  info: "text-electric-light",
  error: "text-coral",
};

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const push = useCallback((message, type = "info") => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    // Error messages now often include an actionable hint (e.g. "run
    // migration_student_accounts.sql") — give admins enough time to actually
    // read and act on them instead of the message vanishing after 4s.
    const duration = type === "error" ? 9000 : 4000;
    setTimeout(() => {
      setToasts((t) => t.filter((toast) => toast.id !== id));
    }, duration);
  }, []);

  const dismiss = (id) => setToasts((t) => t.filter((toast) => toast.id !== id));

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      <div className="fixed bottom-5 right-5 z-[100] flex flex-col gap-2.5 w-[min(360px,calc(100vw-2.5rem))]">
        {toasts.map((toast) => {
          const Icon = icons[toast.type];
          return (
            <div
              key={toast.id}
              className="glass-card flex items-start gap-3 px-4 py-3.5 animate-[fadeUp_0.25s_ease]"
              style={{ animation: "fadeUp 0.25s ease" }}
            >
              <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${iconColor[toast.type]}`} strokeWidth={2} />
              <p className="text-sm text-ink-100 flex-1 leading-snug">{toast.message}</p>
              <button onClick={() => dismiss(toast.id)} className="text-ink-500 hover:text-ink-100 transition-colors">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(8px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}

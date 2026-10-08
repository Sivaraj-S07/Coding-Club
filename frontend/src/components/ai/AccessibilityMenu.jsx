import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Accessibility, Minus, Plus, Contrast, Languages } from "lucide-react";
import { useAccessibility } from "../../lib/accessibility";

const SIZES = ["small", "normal", "large", "xlarge"];

/** Quick accessibility popover that lives in the student navbar. */
export default function AccessibilityMenu() {
  const { settings, update, t } = useAccessibility();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const buttonRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const index = SIZES.indexOf(settings.textSize);
  const step = (delta) => update({ textSize: SIZES[Math.min(SIZES.length - 1, Math.max(0, index + delta))] });
  const iconBtn = "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-ink-100 transition-colors hover:bg-white/10 disabled:opacity-40";

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={t("a11y.menu")}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-300 transition-colors hover:bg-white/10 hover:text-ink-100"
      >
        <Accessibility className="h-5 w-5" />
      </button>
      {open && (
        <div role="dialog" aria-label={t("a11y.menu")} className="absolute right-0 z-50 mt-2 w-72 rounded-2xl border border-white/10 bg-void-panel p-4 shadow-card">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-300">{t("a11y.textSize")}</p>
          <div className="mt-2 flex items-center gap-2">
            <button type="button" className={iconBtn} onClick={() => step(-1)} disabled={index <= 0} aria-label="−">
              <Minus className="h-4 w-4" />
            </button>
            <span className="flex-1 text-center text-sm text-ink-100" aria-live="polite">{t(`a11y.${settings.textSize}`)}</span>
            <button type="button" className={iconBtn} onClick={() => step(1)} disabled={index >= SIZES.length - 1} aria-label="+">
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2">
            <button
              type="button"
              aria-pressed={settings.highContrast}
              onClick={() => update({ highContrast: !settings.highContrast })}
              className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2 text-xs font-medium ${settings.highContrast ? "border-electric bg-electric/15 text-electric-light" : "border-white/10 text-ink-300 hover:bg-white/5"}`}
            >
              <Contrast className="h-4 w-4" /> {t("a11y.highContrast")}
            </button>
            <button
              type="button"
              aria-label={`${t("a11y.language")}: ${settings.language === "en" ? "தமிழ்" : "English"}`}
              onClick={() => update({ language: settings.language === "en" ? "ta" : "en" })}
              className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 px-2 py-2 text-xs font-medium text-ink-300 hover:bg-white/5"
            >
              <Languages className="h-4 w-4" /> {settings.language === "en" ? "தமிழ்" : "English"}
            </button>
          </div>

          <Link to="/accessibility" onClick={() => setOpen(false)} className="mt-4 block rounded-xl bg-white/5 px-3 py-2 text-center text-xs font-medium text-ink-100 hover:bg-white/10">
            {t("a11y.moreSettings")}
          </Link>
        </div>
      )}
    </div>
  );
}

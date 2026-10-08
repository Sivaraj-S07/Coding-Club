import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Modal from "../ui/Modal";
import { useAccessibility } from "../../lib/accessibility";
import { useStudentAccountAuth } from "../../lib/studentAccountAuth";
import { stopSpeaking } from "../../lib/speech";
import { SHORTCUTS } from "../../lib/shortcuts";

function isTyping(target) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}

/**
 * Single-key shortcuts, active only when "Keyboard navigation" is switched on
 * in the Accessibility Center. "g" then a letter jumps between pages; "?"
 * lists them. Disabled inside quizzes and the admin portal so it can never
 * interfere with an exam or with admin forms.
 */
export default function KeyboardShortcuts() {
  const { settings, t } = useAccessibility();
  const { isAuthenticated } = useStudentAccountAuth();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [helpOpen, setHelpOpen] = useState(false);
  const armed = useRef(0);

  const blocked = pathname.startsWith("/quiz/") || pathname.startsWith("/admin");
  const active = settings.keyboardMode && !blocked;

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => {
      if (e.key === "Escape") stopSpeaking();
      if (e.ctrlKey || e.metaKey || e.altKey || isTyping(e.target)) return;
      if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((v) => !v);
        return;
      }
      const now = Date.now();
      if (e.key.toLowerCase() === "g") {
        armed.current = now;
        return;
      }
      if (armed.current && now - armed.current < 1200) {
        const hit = SHORTCUTS.find((s) => s.key === e.key.toLowerCase());
        armed.current = 0;
        if (hit && (hit.public || isAuthenticated)) {
          e.preventDefault();
          navigate(hit.to);
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, isAuthenticated, navigate]);

  return (
    <Modal open={helpOpen && active} onClose={() => setHelpOpen(false)} title={t("a11y.shortcuts")} maxWidth="max-w-sm">
      <p className="text-sm text-ink-300">{t("a11y.shortcutsIntro")}</p>
      <ul className="mt-3 space-y-2">
        {SHORTCUTS.filter((s) => s.public || isAuthenticated).map((s) => (
          <li key={s.key} className="flex items-center justify-between text-sm text-ink-100">
            <span>{t(s.label)}</span>
            <span className="flex items-center gap-1">
              <kbd className="rounded border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-xs">G</kbd>
              <kbd className="rounded border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-xs uppercase">{s.key}</kbd>
            </span>
          </li>
        ))}
        <li className="flex items-center justify-between text-sm text-ink-100">
          <span>{t("tutor.stopSpeaking")}</span>
          <kbd className="rounded border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-xs">Esc</kbd>
        </li>
      </ul>
    </Modal>
  );
}

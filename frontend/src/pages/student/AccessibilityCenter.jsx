import { Link } from "react-router-dom";
import { Accessibility, Type, Contrast, Languages, Keyboard, Sparkles, Eye, RotateCcw, Zap } from "lucide-react";
import Button from "../../components/ui/Button";
import { useAccessibility } from "../../lib/accessibility";
import { useStudentAccountAuth } from "../../lib/studentAccountAuth";
import { SHORTCUTS } from "../../lib/shortcuts";

const SIZES = ["small", "normal", "large", "xlarge"];

function Toggle({ id, icon: Icon, label, help, checked, onChange }) {
  return (
    <div className="glass-card flex items-start gap-4 p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-electric/15 text-electric-light">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <label htmlFor={id} className="block text-sm font-semibold text-ink-100">{label}</label>
        <p id={`${id}-help`} className="mt-0.5 text-xs text-ink-500">{help}</p>
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        aria-describedby={`${id}-help`}
        onClick={() => onChange(!checked)}
        className={`relative mt-1 h-7 w-12 shrink-0 rounded-full border transition-colors ${checked ? "border-electric bg-electric" : "border-white/20 bg-white/10"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${checked ? "left-6" : "left-0.5"}`} />
        <span className="sr-only">{checked ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

export default function AccessibilityCenter() {
  const { settings, update, reset, synced, t } = useAccessibility();
  const { isAuthenticated } = useStudentAccountAuth();

  return (
    <div className="mx-auto max-w-3xl px-5 py-10 lg:px-8">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-violet to-electric shadow-glow">
          <Accessibility className="h-5 w-5 text-void" strokeWidth={2.25} />
        </div>
        <div>
          <h1 className="font-display text-2xl font-semibold text-ink-100">{t("a11y.title")}</h1>
          <p className="mt-1 text-sm text-ink-500">{t("a11y.subtitle")}</p>
        </div>
      </div>

      <div className="mt-8 space-y-4">
        <fieldset className="glass-card p-4">
          <legend className="sr-only">{t("a11y.textSize")}</legend>
          <div className="flex items-center gap-3">
            <Type className="h-5 w-5 text-electric-light" />
            <h2 className="text-sm font-semibold text-ink-100">{t("a11y.textSize")}</h2>
          </div>
          <div role="radiogroup" aria-label={t("a11y.textSize")} className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {SIZES.map((size) => (
              <button
                key={size}
                type="button"
                role="radio"
                aria-checked={settings.textSize === size}
                onClick={() => update({ textSize: size })}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${settings.textSize === size ? "border-electric bg-electric/15 text-electric-light" : "border-white/10 text-ink-300 hover:bg-white/5"}`}
              >
                {t(`a11y.${size}`)}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="glass-card p-4">
          <legend className="sr-only">{t("a11y.language")}</legend>
          <div className="flex items-center gap-3">
            <Languages className="h-5 w-5 text-electric-light" />
            <div>
              <h2 className="text-sm font-semibold text-ink-100">{t("a11y.language")}</h2>
              <p className="text-xs text-ink-500">{t("a11y.languageHelp")}</p>
            </div>
          </div>
          <div role="radiogroup" aria-label={t("a11y.language")} className="mt-3 grid grid-cols-2 gap-2">
            {[["en", "English"], ["ta", "தமிழ்"]].map(([code, label]) => (
              <button
                key={code}
                type="button"
                role="radio"
                aria-checked={settings.language === code}
                lang={code}
                onClick={() => update({ language: code })}
                className={`rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors ${settings.language === code ? "border-electric bg-electric/15 text-electric-light" : "border-white/10 text-ink-300 hover:bg-white/5"}`}
              >
                {label}
              </button>
            ))}
          </div>
        </fieldset>

        <Toggle id="a11y-contrast" icon={Contrast} label={t("a11y.highContrast")} help={t("a11y.highContrastHelp")} checked={settings.highContrast} onChange={(v) => update({ highContrast: v })} />
        <Toggle id="a11y-simple" icon={Sparkles} label={t("a11y.simplified")} help={t("a11y.simplifiedHelp")} checked={settings.simplifiedText} onChange={(v) => update({ simplifiedText: v })} />
        <Toggle id="a11y-dyslexia" icon={Eye} label={t("a11y.dyslexia")} help={t("a11y.dyslexiaHelp")} checked={settings.dyslexiaFriendly} onChange={(v) => update({ dyslexiaFriendly: v })} />
        <Toggle id="a11y-motion" icon={Zap} label={t("a11y.reduceMotion")} help={t("a11y.reduceMotionHelp")} checked={settings.reduceMotion} onChange={(v) => update({ reduceMotion: v })} />
        <Toggle id="a11y-keyboard" icon={Keyboard} label={t("a11y.keyboard")} help={t("a11y.keyboardHelp")} checked={settings.keyboardMode} onChange={(v) => update({ keyboardMode: v })} />

        {settings.keyboardMode && (
          <div className="glass-card p-4">
            <h2 className="text-sm font-semibold text-ink-100">{t("a11y.shortcuts")}</h2>
            <p className="mt-1 text-xs text-ink-500">{t("a11y.shortcutsIntro")}</p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {SHORTCUTS.filter((s) => s.public || isAuthenticated).map((s) => (
                <li key={s.key} className="flex items-center justify-between rounded-xl bg-white/[0.04] px-3 py-2 text-sm text-ink-100">
                  <span>{t(s.label)}</span>
                  <span className="flex gap-1">
                    <kbd className="rounded border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-xs">G</kbd>
                    <kbd className="rounded border border-white/20 bg-white/10 px-2 py-0.5 font-mono text-xs uppercase">{s.key}</kbd>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <section className="glass-card p-5" aria-labelledby="a11y-preview-title">
          <h2 id="a11y-preview-title" className="text-xs font-semibold uppercase tracking-wide text-ink-300">{t("a11y.preview")}</h2>
          <p className="mt-3 text-base leading-relaxed text-ink-100">{t("a11y.previewText")}</p>
          <pre className="mt-3 overflow-x-auto rounded-xl border border-white/10 bg-black/60 p-3 font-mono text-sm text-ink-100"><code>{'age = 17\nprint(age)'}</code></pre>
        </section>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-ink-500">
            {isAuthenticated ? (synced ? t("a11y.synced") : t("a11y.local")) : (
              <>
                {t("a11y.local")} <Link to="/signin" className="text-electric-light underline">{t("nav.signIn")}</Link>
              </>
            )}
          </p>
          <Button variant="secondary" icon={RotateCcw} onClick={reset}>{t("a11y.reset")}</Button>
        </div>
      </div>
    </div>
  );
}

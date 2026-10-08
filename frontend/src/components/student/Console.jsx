import { useRef } from "react";
import { Terminal, Loader2, Eraser } from "lucide-react";

/**
 * Compiler-style console: one unified panel with a scrollable output/
 * transcript area and an always-visible stdin box beneath it — no tab
 * switching between "Input" and "Output". Students type program input
 * directly into the console and press Run (or Submit) right here.
 *
 * This replaces the old two-tab Input/Output panel used in both the quiz
 * CodingWorkspace and the standalone Playground.
 */
export default function Console({
  transcript,
  running,
  stdin,
  onStdinChange,
  onClearOutput,
  statusBadge,
  actions,
  outputPlaceholder = "Press Run to execute your code. Output will appear here.",
  stdinPlaceholder = "Type the input your program should read from standard input (optional)…",
  disabled,
}) {
  const outputRef = useRef(null);

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-white/10 bg-black/40">
      <div className="flex items-center gap-2 border-b border-white/10 bg-white/[0.03] px-3 py-2">
        <Terminal className="h-4 w-4 text-ink-500" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-500">Console</span>
        {running && <Loader2 className="ml-1 h-3.5 w-3.5 animate-spin text-ink-500" />}
        {!running && statusBadge ? <span className="ml-1">{statusBadge}</span> : null}
        {onClearOutput && (
          <button
            type="button"
            onClick={onClearOutput}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-ink-500 transition-colors hover:text-ink-100"
          >
            <Eraser className="h-3.5 w-3.5" /> Clear
          </button>
        )}
      </div>

      <pre
        ref={outputRef}
        style={{ fontVariantLigatures: "none", fontFeatureSettings: '"liga" 0, "calt" 0' }}
        className="h-64 min-h-[180px] flex-none overflow-auto whitespace-pre-wrap break-words p-3 font-mono text-xs leading-relaxed text-ink-200"
      >
        {transcript || outputPlaceholder}
      </pre>

      <div className="border-t border-white/10">
        <label className="flex items-center gap-2 px-3 pt-2 text-[10px] font-semibold uppercase tracking-wide text-ink-600">
          Input (stdin)
        </label>
        <textarea
          value={stdin}
          onChange={(e) => onStdinChange(e.target.value)}
          disabled={disabled}
          rows={5}
          placeholder={stdinPlaceholder}
          style={{ fontVariantLigatures: "none", fontFeatureSettings: '"liga" 0, "calt" 0' }}
          className="w-full resize-y bg-transparent px-3 py-2 font-mono text-xs text-ink-100 outline-none placeholder:text-ink-600 disabled:opacity-60"
        />
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2 border-t border-white/10 bg-white/[0.02] px-3 py-2">
          {actions}
        </div>
      )}
    </div>
  );
}

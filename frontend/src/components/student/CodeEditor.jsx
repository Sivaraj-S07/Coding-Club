import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Maximize2, Minimize2 } from "lucide-react";

/**
 * Lightweight code editor: gutter line numbers, monospace surface, and the
 * editing affordances students expect (Tab indents, auto-indent on Enter).
 *
 * Deliberately dependency-free — no Monaco/CodeMirror download — so the quiz
 * still loads instantly on the college network and offline builds keep working.
 *
 * Sizing: the editor fills its container's height (`height` prop, any CSS
 * size — defaults to a roomy half-screen-ish 56vh) and both the gutter and
 * the text surface scroll together, so code longer than the visible area is
 * always reachable by scrolling rather than being clipped. A maximize button
 * expands the editor to a full-screen overlay for long programs; Escape or
 * the button again returns it to inline size. Nothing about the value,
 * onChange, or keyboard behavior changes between the two modes.
 *
 * Fullscreen implementation notes (both fixed here):
 *  - The overlay is rendered through a portal straight into `document.body`
 *    instead of in place. Every caller nests this editor inside an
 *    `overflow-hidden` card (`.glass-card overflow-hidden` in Playground and
 *    CodingWorkspace). `position: fixed` descendants of an
 *    `overflow: hidden` ancestor are visually clipped/broken in WebKit
 *    (desktop and iOS Safari) even though nothing else changes the
 *    containing block — portaling out of that ancestor is what makes
 *    "Full screen" actually cover the whole screen on every browser/device
 *    instead of only appearing to work on Chromium desktop.
 *  - The inner editor surface fills the remaining flex space (`flex-1
 *    min-h-0`) instead of a hard-coded `calc(100vh - 3rem)`. The old fixed
 *    calculation didn't leave enough room for the toolbar row above it, so
 *    the editor (and the Exit full screen button beneath it, once content
 *    overflowed) could run past the bottom of the screen — worst on short
 *    mobile viewports. Flex-fill sizing has no such shortfall and adapts
 *    automatically to any viewport height, including mobile browsers whose
 *    address bar changes the visible height while the keyboard is open.
 *  - `fullscreenTopOffset` (px) lets a caller reserve space at the very top
 *    of the screen — used by the quiz workspace so its sticky header (with
 *    the countdown timer) stays visible above the editor instead of the
 *    editor's own full-screen toolbar (and Exit full screen button) landing
 *    underneath it.
 */
export default function CodeEditor({
  value,
  onChange,
  disabled,
  placeholder,
  rows = 18,
  height = "68vh",
  minHeight = "440px",
  allowFullscreen = true,
  fullscreenTopOffset = 0,
}) {
  const textareaRef = useRef(null);
  const gutterRef = useRef(null);
  const selectionRef = useRef(null);
  const [fullscreen, setFullscreen] = useState(false);
  const toggleFullscreen = () => {
    if (textareaRef.current) {
      selectionRef.current = {
        start: textareaRef.current.selectionStart,
        end: textareaRef.current.selectionEnd,
        scroll: textareaRef.current.scrollTop,
        horizontal: textareaRef.current.scrollLeft,
      };
    }
    setFullscreen((v) => !v);
  };
  useLayoutEffect(() => {
    if (selectionRef.current && textareaRef.current) {
      const { start, end, scroll, horizontal } = selectionRef.current;
      textareaRef.current.setSelectionRange(start, end);
      textareaRef.current.scrollTop = scroll;
      textareaRef.current.scrollLeft = horizontal;
      textareaRef.current.focus();
      syncScroll();
      selectionRef.current = null;
    }
  }, [fullscreen]);

  const lineCount = useMemo(() => Math.max(String(value || "").split("\n").length, rows), [value, rows]);

  const syncScroll = () => {
    if (gutterRef.current && textareaRef.current) {
      gutterRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  useEffect(() => {
    if (!fullscreen) return undefined;
    const onKeyDown = (e) => {
      if (e.key === "Escape") toggleFullscreen();
    };
    document.addEventListener("keydown", onKeyDown);
    // Lock scrolling on both <html> and <body> — locking body alone still
    // lets some mobile browsers (notably iOS Safari) scroll the page behind
    // a `position: fixed` overlay.
    const htmlEl = document.documentElement;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = htmlEl.style.overflow;
    document.body.style.overflow = "hidden";
    htmlEl.style.overflow = "hidden";
    // Fullscreen changes the textarea's on-screen size; keep the gutter lined
    // up with whatever the scroll position now is.
    requestAnimationFrame(syncScroll);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevBodyOverflow;
      htmlEl.style.overflow = prevHtmlOverflow;
    };
  }, [fullscreen]);

  /**
   * Insert text at the caret *synchronously* so the browser keeps the caret in
   * the right place even when the student keeps typing immediately after.
   * (The previous implementation moved the caret inside requestAnimationFrame,
   * which let the next keystrokes land at the old offset and scrambled
   * characters — e.g. "printf" becoming "rintf" + a stray "p".)
   * execCommand("insertText") is used first because it also preserves the
   * native undo stack; setRangeText is the fallback.
   */
  const insertAtCaret = (el, text) => {
    let inserted = false;
    try {
      inserted = document.execCommand("insertText", false, text);
    } catch {
      inserted = false;
    }
    if (!inserted) {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      el.setRangeText(text, start, end, "end");
    }
    onChange(el.value);
  };

  const handleKeyDown = (e) => {
    if (e.nativeEvent.isComposing || disabled) return;
    const el = e.target;
    if (e.key === "Tab") {
      e.preventDefault();
      insertAtCaret(el, "    ");
      return;
    }
    if (e.key === "Enter") {
      const start = el.selectionStart;
      const current = el.value;
      const lineStart = current.lastIndexOf("\n", start - 1) + 1;
      const currentLine = current.slice(lineStart, start);
      const indent = (currentLine.match(/^[ \t]*/) || [""])[0];
      const extra = /[{:([]\s*$/.test(currentLine) ? "    " : "";
      if (!indent && !extra) return;
      e.preventDefault();
      insertAtCaret(el, `\n${indent}${extra}`);
    }
  };

  // In fullscreen the surface fills whatever space is left in its flex
  // column (see the `flex-1 min-h-0` wrapper below) rather than a hard-coded
  // viewport-height calculation, so it can never overflow past the bottom of
  // the screen regardless of toolbar height or viewport quirks.
  const editorHeightStyle = fullscreen ? undefined : { height, minHeight };

  const surface = (
    <div
      className={
        fullscreen
          ? "flex h-full w-full overflow-hidden rounded-xl border border-white/10 bg-black/60"
          : "flex w-full overflow-hidden rounded-xl border border-white/10 bg-black/40 focus-within:border-electric/40"
      }
      style={editorHeightStyle}
    >
      <div
        ref={gutterRef}
        aria-hidden="true"
        className="h-full select-none overflow-hidden border-r border-white/5 bg-white/[0.03] px-3 py-4 text-right font-mono text-[15px] leading-7 text-ink-500"
      >
        {Array.from({ length: lineCount }).map((_, i) => (
          <div key={i}>{i + 1}</div>
        ))}
      </div>
      <textarea
        ref={textareaRef}
        aria-label="Source code"
        spellCheck={false}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        wrap="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onScroll={syncScroll}
        disabled={disabled}
        readOnly={disabled}
        placeholder={placeholder}
        // Ligatures explicitly disabled inline too (defense in depth, on top
        // of the global .font-mono rule in index.css) so operators like <=,
        // >=, ==, != always show as their real, individual characters.
        style={{ fontVariantLigatures: "none", fontFeatureSettings: '"liga" 0, "calt" 0' }}
        className="h-full w-full flex-1 resize-none overflow-auto bg-transparent p-4 font-mono text-[15px] leading-7 text-ink-100 outline-none disabled:opacity-60"
      />
    </div>
  );

  const toggleButton = (
    <button
      type="button"
      onClick={toggleFullscreen}
      title={fullscreen ? "Exit full screen (Esc)" : "Expand editor to full screen"}
      aria-label={fullscreen ? "Exit full screen editor" : "Expand editor to full screen"}
      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-[11px] text-ink-300 backdrop-blur transition-colors hover:border-electric/40 hover:text-ink-100"
    >
      {fullscreen ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
      {fullscreen ? "Exit full screen" : "Full screen"}
    </button>
  );

  if (fullscreen) {
    // Rendered via a portal straight onto <body> — see the note above the
    // component for why (escaping `overflow-hidden` ancestors so this truly
    // covers the screen on every browser, not just Chromium desktop).
    return createPortal(
      <div
        className="fixed inset-x-0 bottom-0 z-50 flex flex-col gap-2 bg-black/90 p-3 backdrop-blur-sm sm:p-6"
        style={{ top: fullscreenTopOffset }}
      >
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 text-xs text-ink-400">
          <span>Editing — press Esc or Exit full screen to return</span>
          {allowFullscreen && toggleButton}
        </div>
        <div className="min-h-0 flex-1">{surface}</div>
      </div>,
      document.body
    );
  }

  return (
    <div className="relative">
      {allowFullscreen && <div className="absolute right-2 top-2 z-10">{toggleButton}</div>}
      {surface}
    </div>
  );
}

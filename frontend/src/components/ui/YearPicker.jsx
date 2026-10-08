import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarRange, ChevronLeft, ChevronRight } from "lucide-react";

const YEARS_PER_PAGE = 12;

/**
 * Calendar-style year selector: a text-input-like trigger that opens a
 * popover grid of years (like the "year view" of a date-picker calendar),
 * paged a decade at a time. Supports any past, current, or future year
 * within [minYear, maxYear] — both bounds are computed from *today's* date
 * by the caller, so the range (including future years) advances on its own
 * every year rather than being a fixed, hardcoded list.
 */
export default function YearPicker({
  id,
  value,
  onChange,
  minYear,
  maxYear,
  placeholder = "Select year",
  disabled = false,
  className = "",
  ariaInvalid = false,
}) {
  const [open, setOpen] = useState(false);
  const [pageStart, setPageStart] = useState(() => {
    const base = Number(value) || new Date().getFullYear();
    return base - (base % YEARS_PER_PAGE);
  });
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onDocClick = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Whenever the popover opens, jump back to the page containing the
  // current value (or today's year) rather than wherever it was left.
  useEffect(() => {
    if (!open) return;
    const base = Number(value) || new Date().getFullYear();
    setPageStart(base - (((base % YEARS_PER_PAGE) + YEARS_PER_PAGE) % YEARS_PER_PAGE));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const years = useMemo(() => {
    const list = [];
    for (let i = 0; i < YEARS_PER_PAGE; i++) list.push(pageStart + i);
    return list;
  }, [pageStart]);

  const canGoPrev = pageStart - YEARS_PER_PAGE + YEARS_PER_PAGE - 1 >= minYear;
  const canGoNext = pageStart + YEARS_PER_PAGE <= maxYear;
  const todayYear = new Date().getFullYear();

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-invalid={ariaInvalid ? "true" : "false"}
        onClick={() => setOpen((v) => !v)}
        className={`${className} flex w-full items-center justify-between disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <span className={value ? "" : "text-ink-600"}>{value || placeholder}</span>
        <CalendarRange className="h-4 w-4 shrink-0 text-ink-500" />
      </button>

      {open && !disabled && (
        <div
          role="dialog"
          aria-label="Choose a year"
          className="glass-panel absolute left-0 top-[calc(100%+6px)] z-30 w-64 bg-[#0b0e22] p-3 shadow-2xl shadow-black/60"
        >
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              aria-label="Previous years"
              disabled={!canGoPrev}
              onClick={() => setPageStart((p) => p - YEARS_PER_PAGE)}
              className="rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-white/10 hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-medium text-ink-300">
              {pageStart} – {pageStart + YEARS_PER_PAGE - 1}
            </span>
            <button
              type="button"
              aria-label="Next years"
              disabled={!canGoNext}
              onClick={() => setPageStart((p) => p + YEARS_PER_PAGE)}
              className="rounded-lg p-1.5 text-ink-500 transition-colors hover:bg-white/10 hover:text-ink-100 disabled:cursor-not-allowed disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1.5">
            {years.map((year) => {
              const inRange = year >= minYear && year <= maxYear;
              const selected = String(year) === String(value);
              return (
                <button
                  key={year}
                  type="button"
                  disabled={!inRange}
                  onClick={() => {
                    onChange(String(year));
                    setOpen(false);
                  }}
                  className={`rounded-lg px-2 py-2 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${
                    selected
                      ? "bg-electric text-void font-semibold"
                      : year === todayYear
                        ? "border border-electric/40 text-electric-light hover:bg-electric/15"
                        : "text-ink-100 hover:bg-white/10"
                  }`}
                >
                  {year}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

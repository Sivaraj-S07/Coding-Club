const tones = {
  live: "bg-mint/10 text-mint border-mint/30 shadow-[0_0_12px_rgba(52,228,176,0.25)]",
  upcoming: "bg-electric/10 text-electric-light border-electric/30 shadow-[0_0_12px_rgba(77,141,255,0.18)]",
  completed: "bg-white/5 text-ink-400 border-white/10",
  draft: "bg-amber/10 text-amber border-amber/30",
  danger: "bg-coral/10 text-coral border-coral/30",
  violet: "bg-violet/10 text-violet-soft border-violet/30 shadow-[0_0_12px_rgba(139,92,246,0.2)]",
};

export default function Badge({ tone = "upcoming", children, dot = false, className = "" }) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide ${tones[tone]} ${className}`}
    >
      {dot && (
        <span className={`h-1.5 w-1.5 rounded-full ${tone === "live" ? "bg-mint animate-pulseGlow" : "bg-current"}`} />
      )}
      {children}
    </span>
  );
}

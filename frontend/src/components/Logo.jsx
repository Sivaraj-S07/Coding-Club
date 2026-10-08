export default function Logo({ size = "md", showWordmark = true }) {
  const dims = size === "sm" ? "h-8 w-8" : size === "lg" ? "h-12 w-12" : "h-9 w-9";
  const textSize = size === "sm" ? "text-sm" : size === "lg" ? "text-xl" : "text-base";

  return (
    <div className="flex items-center gap-2.5 select-none">
      <div className={`relative ${dims} shrink-0 overflow-hidden rounded-full shadow-[0_0_18px_rgba(77,141,255,0.45)] ring-1 ring-electric/40`}>
        <img
          src="/logo.png"
          alt="Eduverse logo"
          className="h-full w-full object-contain"
          draggable="false"
        />
      </div>
      {showWordmark && (
        <div className="leading-tight">
          <p className={`font-display font-semibold tracking-tight ${textSize} text-ink-100`}>
            Edu<span className="text-gradient">verse</span>
          </p>
          <p className="text-[10px] uppercase tracking-[0.2em] text-ink-400 -mt-0.5">Learn · Practice · Build · Grow</p>
        </div>
      )}
    </div>
  );
}

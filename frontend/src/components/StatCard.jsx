export default function StatCard({ icon: Icon, label, value, trend, accent = "electric" }) {
  const accents = {
    electric: "text-electric-light bg-electric/10",
    violet: "text-violet-soft bg-violet/10",
    mint: "text-mint bg-mint/10",
    amber: "text-amber bg-amber/10",
    coral: "text-coral bg-coral/10",
  };

  return (
    <div className="glass-card hover-lift p-5 hover:-translate-y-1 transition-all duration-300">
      <div className="flex items-start justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-xl ring-1 ring-white/10 ${accents[accent]}`}>
          <Icon className="h-5 w-5" strokeWidth={2.25} />
        </div>
        {trend && (
          <span className={`text-xs font-medium ${trend.startsWith("-") ? "text-coral" : "text-mint"}`}>
            {trend}
          </span>
        )}
      </div>
      <p className="mt-4 font-display text-2xl font-semibold text-ink-100 font-tabular">{value}</p>
      <p className="mt-1 text-xs text-ink-500">{label}</p>
    </div>
  );
}

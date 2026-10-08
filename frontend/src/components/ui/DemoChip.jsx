import { Sparkles } from "lucide-react";

/** Small marker shown wherever sample content stands in for live data. */
export default function DemoChip({ children = "Sample data", className = "" }) {
  return (
    <span className={`demo-chip ${className}`} title="Shown because no live data is available yet">
      <Sparkles className="h-3 w-3" aria-hidden="true" /> {children}
    </span>
  );
}

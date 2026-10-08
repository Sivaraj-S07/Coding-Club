export default function Skeleton({ className = "" }) {
  return (
    <div
      className={`rounded-lg bg-gradient-to-r from-white/[0.04] via-white/[0.09] to-white/[0.04] bg-[length:200%_100%] animate-shimmer ${className}`}
    />
  );
}

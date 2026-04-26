"use client";

interface Props {
  score: number;
  size?: "sm" | "md";
}

export function TrustGauge({ score, size = "md" }: Props) {
  const r = size === "sm" ? 28 : 36;
  const cx = size === "sm" ? 32 : 40;
  const viewBox = size === "sm" ? "0 0 64 64" : "0 0 80 80";
  const dim = size === "sm" ? "w-16 h-16" : "w-24 h-24";
  const numSize = size === "sm" ? "text-base" : "text-xl";
  const sw = size === "sm" ? 5 : 6;

  const circumference = 2 * Math.PI * r;
  const clampedScore = Math.max(0, Math.min(100, score));
  const dashOffset = circumference * (1 - clampedScore / 100);

  const color =
    clampedScore >= 70 ? "#22c55e" : clampedScore >= 45 ? "#f59e0b" : "#ef4444";
  const label =
    clampedScore >= 70 ? "High Trust" : clampedScore >= 45 ? "Med Trust" : "Low Trust";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`relative ${dim}`}>
        <svg viewBox={viewBox} className="w-full h-full -rotate-90">
          {/* Track */}
          <circle cx={cx} cy={cx} r={r} fill="none" stroke="#e2e8f0" strokeWidth={sw} />
          {/* Arc */}
          <circle
            cx={cx} cy={cx} r={r}
            fill="none"
            stroke={color}
            strokeWidth={sw}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
            style={{ transition: "stroke-dashoffset 0.5s ease" }}
          />
        </svg>
        {/* Score */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`${numSize} font-bold leading-none`} style={{ color: "var(--text-primary)" }}>
            {clampedScore}
          </span>
          <span className="text-xs leading-none mt-0.5" style={{ color: "var(--text-muted)" }}>/100</span>
        </div>
      </div>
      <span className="text-xs font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}

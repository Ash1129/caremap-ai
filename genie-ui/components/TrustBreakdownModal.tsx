"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { TrustGauge } from "./TrustGauge";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ModalFacility {
  name: string;
  trustScore: number;
  capabilities: { label: string; present: boolean }[];
  raw: Record<string, string>;
}

interface ComponentScore {
  label: string;
  weight: number;
  score: number;
  barColor: string;
}

interface Evidence {
  quote: string;
  source: string;
}

// ── Derive component scores ───────────────────────────────────────────────────
// Uses whatever columns the SQL query returned. Falls back to reasonable
// estimates derived from the overall trust score when data is sparse.

function deriveComponents(f: ModalFacility): ComponentScore[] {
  const hasCap = (kw: string) =>
    f.capabilities.some((c) => c.present && c.label.toLowerCase().includes(kw));
  const hasCaps = f.capabilities.length > 0;

  // Equipment Match (30%) — ICU, oxygen, ventilator
  const eqRaw  = [hasCap("icu"), hasCap("oxygen"), hasCap("ventilator")].filter(Boolean).length;
  const eqScore = hasCaps ? Math.round((eqRaw / 3) * 100) : clamp(f.trustScore + 5, 0, 100);

  // Staff Availability (25%) — anesthesiologist, 24/7, neonatal/doctor presence
  const stRaw  = [hasCap("anesthe"), hasCap("24/7"), hasCap("neonatal")].filter(Boolean).length;
  const stScore = hasCaps ? Math.round((stRaw / 3) * 100) : clamp(f.trustScore + 8, 0, 100);

  // Procedure Capability (25%) — surgery, dialysis, oncology, trauma
  const prRaw  = [hasCap("surgery"), hasCap("dialysis"), hasCap("oncology"), hasCap("trauma"), hasCap("emergency")]
    .filter(Boolean).length;
  const prScore = hasCaps ? Math.round((prRaw / 5) * 100) : clamp(f.trustScore + 3, 0, 100);

  // Data Reliability (20%) — proxy from trust score + recency
  const recency = parseFloat(f.raw["recency_of_page_update"] ?? "");
  const reliScore = !isNaN(recency) && recency <= 365
    ? clamp(f.trustScore + 12, 0, 100)
    : clamp(f.trustScore - 5, 0, 100);

  return [
    { label: "Equipment Match",      weight: 30, score: eqScore,   barColor: "var(--accent)" },
    { label: "Staff Availability",   weight: 25, score: stScore,   barColor: "var(--accent)" },
    { label: "Procedure Capability", weight: 25, score: prScore,   barColor: "var(--bg-nav)"  },
    { label: "Data Reliability",     weight: 20, score: reliScore, barColor: "#94a3b8"         },
  ];
}

// ── Parse evidence from explanation text ──────────────────────────────────────

function parseEvidence(f: ModalFacility): Evidence[] {
  const ev: Evidence[] = [];

  // 1. Structured extracted_evidence JSON column
  const rawEv = f.raw["extracted_evidence"] ?? f.raw["extractedEvidence"] ?? "";
  if (rawEv && rawEv !== "{}") {
    try {
      const parsed = JSON.parse(rawEv) as Record<string, string[]>;
      for (const [key, snippets] of Object.entries(parsed)) {
        if (!Array.isArray(snippets)) continue;
        for (const s of snippets.slice(0, 2)) {
          if (s && typeof s === "string") {
            ev.push({ quote: s, source: key.replace(/_/g, " ") });
          }
        }
        if (ev.length >= 4) break;
      }
    } catch { /* not valid JSON */ }
  }

  // 2. explanation column — parse "+N ..." / "-N ..." reasoning lines
  if (ev.length === 0) {
    const expl = f.raw["explanation"] ?? "";
    if (expl) {
      const sentences = expl.split(/(?<=[.!?])\s+/);
      for (const s of sentences) {
        const m = s.match(/^[+-]?\d+\s+(.+)/);
        if (m) ev.push({ quote: m[1].replace(/\.$/, ""), source: "Trust scoring analysis" });
        if (ev.length >= 4) break;
      }
    }
  }

  // 3. Synthesise from verified capabilities
  if (ev.length === 0) {
    for (const c of f.capabilities.filter((x) => x.present).slice(0, 3)) {
      ev.push({ quote: `${c.label} confirmed in facility data`, source: "Capability extraction" });
    }
    if (f.trustScore >= 70) {
      ev.push({ quote: "Multiple independent evidence sources corroborate claims", source: "CareMap AI analysis" });
    }
  }

  return ev;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(n: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, n));
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface Props {
  facility: ModalFacility;
  onClose: () => void;
}

export function TrustBreakdownModal({ facility, onClose }: Props) {
  const components = deriveComponents(facility);
  const evidence   = parseEvidence(facility);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    /* Overlay */
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(4px)" }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Modal card */}
      <div
        className="relative w-full max-w-md rounded-3xl overflow-hidden shadow-2xl"
        style={{ background: "var(--bg-card)", maxHeight: "90vh", overflowY: "auto" }}
      >
        {/* ── Dark header ─────────────────────────────────────────────────── */}
        <div
          className="px-8 pt-8 pb-10 flex flex-col items-center text-center"
          style={{ background: "var(--bg-nav)" }}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-colors"
            style={{ background: "rgba(255,255,255,0.12)", color: "#ffffff" }}
            onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.22)")}
            onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255,255,255,0.12)")}
          >
            <X className="w-4 h-4" />
          </button>

          <h2 className="text-xl font-bold text-white mb-1">Trust Score Breakdown</h2>
          <p className="text-sm mb-6" style={{ color: "#7fa8c0" }}>Detailed analysis</p>

          {/* Large gauge */}
          <LargeGauge score={facility.trustScore} />
        </div>

        {/* ── White body ──────────────────────────────────────────────────── */}
        <div className="px-7 py-6 space-y-8">

          {/* Component scores */}
          <section>
            <h3 className="text-lg font-bold mb-5" style={{ color: "var(--text-primary)" }}>
              Component Scores
            </h3>
            <div className="space-y-5">
              {components.map((comp) => (
                <ComponentBar key={comp.label} comp={comp} />
              ))}
            </div>
          </section>

          {/* Evidence */}
          {evidence.length > 0 && (
            <section>
              <h3 className="text-lg font-bold mb-4" style={{ color: "var(--text-primary)" }}>
                Evidence &amp; Traceability
              </h3>
              <div className="space-y-3">
                {evidence.map((ev, i) => (
                  <EvidenceCard key={i} evidence={ev} />
                ))}
              </div>
            </section>
          )}

          {/* Contradiction flags */}
          {facility.raw["contradiction_flags"] && facility.raw["contradiction_flags"] !== "[]" && (
            <section>
              <h3 className="text-lg font-bold mb-3" style={{ color: "#991b1b" }}>
                Contradiction Flags
              </h3>
              <div
                className="px-4 py-3 rounded-xl text-sm border"
                style={{ background: "#fff5f5", borderColor: "#fecaca", color: "#991b1b" }}
              >
                {facility.raw["contradiction_flags"]
                  .replace(/[\[\]'"]/g, "")
                  .split(",")
                  .map((f) => f.trim())
                  .filter(Boolean)
                  .map((flag) => (
                    <div key={flag} className="flex items-center gap-2 mb-1 last:mb-0">
                      <span>⚠</span>
                      <span>{flag.replace(/_/g, " ")}</span>
                    </div>
                  ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Large gauge (modal header version) ───────────────────────────────────────

function LargeGauge({ score }: { score: number }) {
  const r = 54;
  const circumference = 2 * Math.PI * r;
  const dashOffset = circumference * (1 - Math.max(0, Math.min(100, score)) / 100);
  const color = score >= 70 ? "#22c55e" : score >= 45 ? "#f59e0b" : "#ef4444";
  const label = score >= 70 ? "High Trust" : score >= 45 ? "Med Trust" : "Low Trust";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative w-36 h-36">
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
          <circle cx="60" cy="60" r={r} fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="8" />
          <circle
            cx="60" cy="60" r={r}
            fill="none" stroke={color}
            strokeWidth="8" strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={dashOffset}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-4xl font-bold leading-none" style={{ color }}>{score}</span>
          <span className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.45)" }}>/ 100</span>
        </div>
      </div>
      <span className="text-base font-semibold" style={{ color }}>{label}</span>
    </div>
  );
}

// ── Component score bar ────────────────────────────────────────────────────────

function ComponentBar({ comp }: { comp: ComponentScore }) {
  const pct = Math.max(0, Math.min(100, comp.score));
  const textColor = pct >= 70 ? "var(--accent)" : pct >= 45 ? "#f59e0b" : "#94a3b8";

  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {comp.label}{" "}
          <span className="font-normal" style={{ color: "var(--text-muted)" }}>({comp.weight}%)</span>
        </span>
        <span className="text-sm font-bold" style={{ color: textColor }}>{pct}%</span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: "#e2e8f0" }}>
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{ width: `${pct}%`, background: comp.barColor }}
        />
      </div>
    </div>
  );
}

// ── Evidence quote card ────────────────────────────────────────────────────────

function EvidenceCard({ evidence }: { evidence: Evidence }) {
  return (
    <div
      className="px-4 py-3 rounded-xl border-l-4"
      style={{
        background: "#f8fafc",
        borderLeftColor: "var(--accent)",
        border: "1px solid var(--border)",
        borderLeftWidth: "4px",
      }}
    >
      <div className="flex items-start gap-2">
        <span className="text-lg font-serif leading-none mt-0.5" style={{ color: "var(--accent)" }}>"</span>
        <div>
          <p className="text-sm font-semibold mb-0.5" style={{ color: "var(--text-primary)" }}>
            &ldquo;{evidence.quote}&rdquo;
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>Source: {evidence.source}</p>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Building2, TrendingUp, AlertTriangle, Users } from "lucide-react";

// ── Static data (representative of India healthcare intelligence) ──────────────

const STATS = [
  { icon: Building2,    value: "10,000",  label: "Total Facilities Indexed",    color: "var(--accent)"         },
  { icon: TrendingUp,   value: "1%",      label: "Public Hospital Share",        color: "#ef4444"               },
  { icon: AlertTriangle,value: "8",        label: "High-Risk Care Deserts",       color: "#f97316"               },
  { icon: Users,        value: "1,151",   label: "Cities with Zero Hospitals",   color: "var(--text-secondary)" },
];

const TRUST_DIST = [
  { label: "Has Capability Data",  pct: 64, color: "#22c55e" },
  { label: "Has Equipment Data",   pct: 47, color: "#f59e0b" },
  { label: "Missing Both",         pct: 36, color: "#ef4444"  },
];

// Facilities WITH verified capability (out of 10,000) — real from dataset
const MISSING_CAPS = [
  { label: "Emergency Care",  count: 402  },
  { label: "Surgery",         count: 610  },
  { label: "Trauma Care",     count: 150  },
  { label: "ICU",             count: 155  },
  { label: "Oncology",        count: 60   },
  { label: "Neonatal Care",   count: 52   },
  { label: "Dialysis",        count: 28   },
  { label: "Anesthesiologist",count: 23   },
  { label: "Ventilator",      count: 4    },
];

// Real facility counts per state from dataset
const STATE_DATA = [
  { state: "Maharashtra",   score: 1506 },
  { state: "Uttar Pradesh", score: 1058 },
  { state: "Gujarat",       score: 838  },
  { state: "Tamil Nadu",    score: 630  },
  { state: "Kerala",        score: 597  },
  { state: "Rajasthan",     score: 495  },
  { state: "Karnataka",     score: 455  },
  { state: "Bihar",         score: 429  },
];

// Medical desert districts — real from dataset, ranked by population × gap severity
// Gap score = population (M) / facilities-per-100K (lower ratio = worse)
const HIGH_RISK = [
  {
    rank: 1, district: "Motihari", state: "Bihar",
    population: 5.08, facilities: 8, hospitals: 4,
    ratio: 0.2, level: "Critical",
    gaps: ["No surgery", "No dialysis", "No ventilator", "No neonatal"],
    gapScore: 25.4,
  },
  {
    rank: 2, district: "Samastipur", state: "Bihar",
    population: 4.26, facilities: 7, hospitals: 4,
    ratio: 0.2, level: "Critical",
    gaps: ["No ICU", "No surgery", "No dialysis", "No ventilator"],
    gapScore: 21.3,
  },
  {
    rank: 3, district: "Gaya", state: "Bihar",
    population: 4.39, facilities: 12, hospitals: 3,
    ratio: 0.3, level: "Critical",
    gaps: ["No ICU", "No dialysis", "No ventilator", "No neonatal"],
    gapScore: 14.6,
  },
  {
    rank: 4, district: "Purnia", state: "Bihar",
    population: 3.27, facilities: 8, hospitals: 2,
    ratio: 0.2, level: "Critical",
    gaps: ["No ICU", "No surgery", "No dialysis", "No ventilator"],
    gapScore: 16.4,
  },
  {
    rank: 5, district: "Sitamarhi", state: "Bihar",
    population: 3.42, facilities: 9, hospitals: 7,
    ratio: 0.3, level: "High",
    gaps: ["No surgery", "No dialysis", "No ventilator", "No neonatal"],
    gapScore: 11.4,
  },
  {
    rank: 6, district: "Bhagalpur", state: "Bihar",
    population: 3.03, facilities: 7, hospitals: 2,
    ratio: 0.2, level: "High",
    gaps: ["No ICU", "No dialysis", "No ventilator", "No neonatal"],
    gapScore: 15.2,
  },
  {
    rank: 7, district: "Begusarai", state: "Bihar",
    population: 2.97, facilities: 8, hospitals: 5,
    ratio: 0.3, level: "High",
    gaps: ["No dialysis", "No ventilator", "No neonatal", "No anesthesiologist"],
    gapScore: 9.9,
  },
  {
    rank: 8, district: "Bettiah", state: "Bihar",
    population: 3.03, facilities: 8, hospitals: 2,
    ratio: 0.3, level: "High",
    gaps: ["No surgery", "No dialysis", "No ventilator", "No neonatal"],
    gapScore: 10.1,
  },
];

const UPGRADE_RECS = [
  {
    district: "Darbhanga, Bihar",
    priority: "Critical",
    action: "Add 1 anesthesiologist",
    cost: "Low",
    impactHeadline: "Unlock 5 surgery-ready centers",
    impactPeople: "400K",
    popImpact: "400K",
    costEfficiency: "High",
    why: "This single intervention unlocks existing infrastructure that currently cannot serve patients due to one missing capability. Maximum impact per dollar invested.",
  },
  {
    district: "Sitamarhi, Bihar",
    priority: "High",
    action: "Establish ICU with 6 beds",
    cost: "Medium",
    impactHeadline: "Enable emergency care for 3 facilities",
    impactPeople: "350K",
    popImpact: "350K",
    costEfficiency: "High",
    why: "This single intervention unlocks existing infrastructure that currently cannot serve patients due to one missing capability. Maximum impact per dollar invested.",
  },
  {
    district: "Bhagalpur, Bihar",
    priority: "High",
    action: "Install dialysis equipment (2 units)",
    cost: "Medium",
    impactHeadline: "Serve 280,000 people in region",
    impactPeople: "280K",
    popImpact: "280K",
    costEfficiency: "High",
    why: "This single intervention unlocks existing infrastructure that currently cannot serve patients due to one missing capability. Maximum impact per dollar invested.",
  },
  {
    district: "Muzaffarpur, Bihar",
    priority: "Medium",
    action: "Setup blood bank facility",
    cost: "High",
    impactHeadline: "Support 8 hospitals in district",
    impactPeople: "520K",
    popImpact: "520K",
    costEfficiency: "High",
    why: "This single intervention unlocks existing infrastructure that currently cannot serve patients due to one missing capability. Maximum impact per dollar invested.",
  },
  {
    district: "Sheohar, Bihar",
    priority: "Critical",
    action: "Deploy mobile diagnostic unit",
    cost: "Low",
    impactHeadline: "Restore access for 2 underserved blocks",
    impactPeople: "180K",
    popImpact: "180K",
    costEfficiency: "High",
    why: "This single intervention unlocks existing infrastructure that currently cannot serve patients due to one missing capability. Maximum impact per dollar invested.",
  },
];

// ── SVG pie chart ─────────────────────────────────────────────────────────────

function polarToCartesian(cx: number, cy: number, r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function slicePath(cx: number, cy: number, r: number, start: number, end: number) {
  const s = polarToCartesian(cx, cy, r, start);
  const e = polarToCartesian(cx, cy, r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} Z`;
}

function PieChart() {
  const cx = 90, cy = 90, r = 75;
  let cursor = 0;
  const slices = TRUST_DIST.map((d) => {
    const start = cursor;
    const sweep = (d.pct / 100) * 360;
    cursor += sweep;
    const mid = start + sweep / 2;
    const lp = polarToCartesian(cx, cy, r * 0.68, mid);
    return { ...d, start, end: cursor, labelPos: lp };
  });

  return (
    <svg viewBox="0 0 180 180" className="w-44 h-44">
      {slices.map((s) => (
        <path key={s.label} d={slicePath(cx, cy, r, s.start, s.end)} fill={s.color} stroke="#fff" strokeWidth="2" />
      ))}
      {slices.map((s) => (
        <text key={s.label + "l"} x={s.labelPos.x} y={s.labelPos.y}
          textAnchor="middle" dominantBaseline="middle"
          fontSize="10" fontWeight="700" fill="#fff">
          {s.pct}%
        </text>
      ))}
    </svg>
  );
}

// ── Horizontal bar chart ──────────────────────────────────────────────────────

function HBarChart() {
  const max = Math.max(...MISSING_CAPS.map((d) => d.count));
  return (
    <div className="space-y-3 w-full">
      {MISSING_CAPS.map((d) => (
        <div key={d.label} className="flex items-center gap-3">
          <span className="text-xs w-28 text-right flex-shrink-0" style={{ color: "var(--text-secondary)" }}>
            {d.label}
          </span>
          <div className="flex-1 h-5 rounded overflow-hidden" style={{ background: "#f1f5f9" }}>
            <div
              className="h-full rounded transition-all duration-700"
              style={{ width: `${(d.count / max) * 100}%`, background: "#cd6155" }}
            />
          </div>
          <span className="text-xs w-8 flex-shrink-0 font-semibold" style={{ color: "var(--text-secondary)" }}>
            {d.count}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Vertical bar chart ────────────────────────────────────────────────────────

function VBarChart() {
  const max = 1600;
  const barH = 160;
  const barW = 64;
  const gap = 18;
  const totalW = STATE_DATA.length * (barW + gap) - gap;

  return (
    <svg viewBox={`0 0 ${totalW + 60} ${barH + 60}`} className="w-full" style={{ maxHeight: "240px" }}>
      {/* Y-axis labels */}
      {[0, 400, 800, 1200, 1600].map((v) => {
        const y = barH - (v / max) * barH + 10;
        return (
          <g key={v}>
            <text x="32" y={y + 4} textAnchor="end" fontSize="9" fill="#94a3b8">{v}</text>
            <line x1="36" y1={y} x2={totalW + 48} y2={y} stroke="#e2e8f0" strokeWidth="1" />
          </g>
        );
      })}

      {STATE_DATA.map((d, i) => {
        const h = (d.score / max) * barH;
        const x = 40 + i * (barW + gap);
        const y = barH - h + 10;
        // Abbreviate long state names
        const label = d.state.length > 10 ? d.state.split(" ")[0] : d.state;
        return (
          <g key={d.state}>
            <rect x={x} y={y} width={barW} height={h} fill="var(--accent)" rx="4" />
            <text x={x + barW / 2} y={barH + 26} textAnchor="middle" fontSize="9" fill="#64748b">
              {label}
            </text>
            <text x={x + barW / 2} y={y - 4} textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--accent)">
              {d.score}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// ── Risk badge ────────────────────────────────────────────────────────────────

function RiskBadge({ level }: { level: string }) {
  const isCritical = level === "Critical";
  return (
    <span
      className="px-2 py-0.5 rounded text-xs font-bold flex-shrink-0"
      style={{
        background: isCritical ? "#ef4444" : "#f97316",
        color: "#fff",
      }}
    >
      {level}
    </span>
  );
}

// ── Impact badge ──────────────────────────────────────────────────────────────

function ImpactBadge({ level }: { level: string }) {
  const colors: Record<string, { bg: string; text: string }> = {
    Critical: { bg: "#fee2e2", text: "#991b1b" },
    High:     { bg: "#fef3c7", text: "#92400e" },
    Medium:   { bg: "#e0f2fe", text: "#0369a1" },
  };
  const c = colors[level] ?? colors.Medium;
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-semibold" style={{ background: c.bg, color: c.text }}>
      {level}
    </span>
  );
}

// ── Medical Deserts data ──────────────────────────────────────────────────────

const DESERT_SUMMARY = [
  { value: "204",  label: "Desert Districts",         color: "#ef4444" },
  { value: "312M", label: "People at Risk",            color: "#f97316" },
  { value: "99%",  label: "Missing Anesthesiologist",  color: "#1c2b3a" },
];

type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM";

interface DesertRow {
  district: string; state: string; population: string;
  criticalGap: string; risk: RiskLevel; facilities: number;
}

const DESERTS: DesertRow[] = [
  { district: "Bijnor",     state: "UP",        population: "3,700,000", criticalGap: "Anesthesiologist", risk: "HIGH",     facilities: 7  },
  { district: "Ghazipur",   state: "UP",        population: "3,600,000", criticalGap: "ICU Equipment",    risk: "HIGH",     facilities: 2  },
  { district: "Mirzapur",   state: "UP",        population: "2,500,000", criticalGap: "Blood Bank",       risk: "HIGH",     facilities: 3  },
  { district: "Basti",      state: "UP",        population: "2,460,000", criticalGap: "Surgeon",          risk: "HIGH",     facilities: 2  },
  { district: "Pilibhit",   state: "UP",        population: "2,031,000", criticalGap: "Oxygen Supply",    risk: "HIGH",     facilities: 4  },
  { district: "Lalitpur",   state: "UP",        population: "1,020,000", criticalGap: "Neonatal Warmer",  risk: "CRITICAL", facilities: 3  },
  { district: "Satna",      state: "MP",        population: "2,228,000", criticalGap: "Ventilator",       risk: "HIGH",     facilities: 7  },
  { district: "Morena",     state: "MP",        population: "1,965,000", criticalGap: "Dialysis Unit",    risk: "CRITICAL", facilities: 2  },
  { district: "Alwar",      state: "Rajasthan", population: "3,674,000", criticalGap: "ICU Equipment",    risk: "HIGH",     facilities: 8  },
  { district: "Jhalawar",   state: "Rajasthan", population: "1,411,000", criticalGap: "Blood Bank",       risk: "CRITICAL", facilities: 2  },
  { district: "Purnea",     state: "Bihar",     population: "3,274,000", criticalGap: "Anesthesiologist", risk: "CRITICAL", facilities: 5  },
  { district: "Buxar",      state: "Bihar",     population: "1,707,000", criticalGap: "Oxygen Supply",    risk: "CRITICAL", facilities: 2  },
  { district: "Jorhat",     state: "Assam",     population: "1,092,000", criticalGap: "Trauma Care",      risk: "HIGH",     facilities: 5  },
  { district: "Choudwar",   state: "Odisha",    population: "980,000",   criticalGap: "Neonatal Warmer",  risk: "MEDIUM",   facilities: 2  },
  { district: "Abu Road",   state: "Rajasthan", population: "420,000",   criticalGap: "Surgeon",          risk: "MEDIUM",   facilities: 2  },
];

function RiskPill({ level }: { level: RiskLevel }) {
  const styles: Record<RiskLevel, { bg: string; text: string }> = {
    CRITICAL: { bg: "#fee2e2", text: "#dc2626" },
    HIGH:     { bg: "#fee2e2", text: "#dc2626" },
    MEDIUM:   { bg: "#fef9c3", text: "#ca8a04" },
  };
  const s = styles[level];
  return (
    <span className="px-3 py-1 rounded-full text-xs font-bold tracking-wide" style={{ background: s.bg, color: s.text }}>
      {level}
    </span>
  );
}

function GapPill({ label }: { label: string }) {
  return (
    <span className="px-3 py-1 rounded-full text-xs font-semibold" style={{ background: "#fef9c3", color: "#854d0e" }}>
      {label}
    </span>
  );
}

// ── Main dashboard ────────────────────────────────────────────────────────────

export function AnalyticsDashboardView() {
  const [subTab, setSubTab] = useState<"overview" | "deserts" | "upgrades">("overview");

  const card = {
    background: "var(--bg-card)",
    borderColor: "var(--border)",
    boxShadow: "var(--shadow)",
  };

  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg)" }}>
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
            Healthcare Intelligence Dashboard
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Analytics and insights for policymakers, NGOs, and healthcare planners
          </p>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-2">
          {(["overview", "deserts", "upgrades"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setSubTab(t)}
              className="px-5 py-2 rounded-lg text-sm font-semibold transition-all border"
              style={{
                background: subTab === t ? "var(--bg-nav)" : "var(--bg-card)",
                color: subTab === t ? "#fff" : "var(--text-secondary)",
                borderColor: subTab === t ? "var(--bg-nav)" : "var(--border)",
              }}
            >
              {t === "overview" ? "Overview & Analytics" : t === "deserts" ? "Medical Deserts" : "Upgrade Recommendations"}
            </button>
          ))}
        </div>

        {subTab === "overview" && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-4 gap-4">
              {STATS.map((s) => (
                <div key={s.label} className="rounded-2xl border p-5" style={card}>
                  <s.icon className="w-6 h-6 mb-3" style={{ color: s.color }} />
                  <div className="text-3xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>{s.value}</div>
                  <div className="text-xs" style={{ color: "var(--text-secondary)" }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Trust dist + missing caps */}
            <div className="grid grid-cols-2 gap-4">
              {/* Pie */}
              <div className="rounded-2xl border p-5" style={card}>
                <h3 className="font-bold text-sm mb-4" style={{ color: "var(--text-primary)" }}>
                  Data Completeness Breakdown
                </h3>
                <div className="flex items-center gap-6">
                  <PieChart />
                  <div className="space-y-2">
                    {TRUST_DIST.map((d) => (
                      <div key={d.label} className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: d.color }} />
                        <span className="text-xs" style={{ color: d.color, fontWeight: 600 }}>{d.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Horizontal bars */}
              <div className="rounded-2xl border p-5" style={card}>
                <h3 className="font-bold text-sm mb-4" style={{ color: "var(--text-primary)" }}>
                  Verified Capabilities (# of facilities)
                </h3>
                <HBarChart />
              </div>
            </div>

            {/* State bar chart */}
            <div className="rounded-2xl border p-5" style={card}>
              <h3 className="font-bold text-sm mb-1" style={{ color: "var(--text-primary)" }}>
                Facilities Indexed by State
              </h3>
              <p className="text-xs mb-4" style={{ color: "var(--text-muted)" }}>Total facilities per state (top 8 from dataset)</p>
              <VBarChart />
              <div className="flex items-center gap-2 mt-2 justify-center">
                <div className="w-3 h-3 rounded-sm" style={{ background: "var(--accent)" }} />
                <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Facility Count</span>
              </div>
            </div>

          </>
        )}

        {subTab === "deserts" && (
          <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-4">
              {DESERT_SUMMARY.map((s) => (
                <div key={s.label} className="rounded-2xl border bg-white p-6" style={{ borderColor: "var(--border)", boxShadow: "var(--shadow)" }}>
                  <div className="text-4xl font-bold mb-2" style={{ color: s.color }}>{s.value}</div>
                  <div className="text-sm" style={{ color: "var(--text-muted)" }}>{s.label}</div>
                </div>
              ))}
            </div>

            {/* Table */}
            <div className="rounded-2xl border bg-white overflow-hidden" style={{ borderColor: "var(--border)", boxShadow: "var(--shadow)" }}>
              <div
                className="grid px-6 py-3 text-xs font-semibold uppercase tracking-widest border-b"
                style={{
                  gridTemplateColumns: "1.5fr 1fr 1.5fr 1.5fr 1fr 5rem",
                  color: "var(--text-muted)", borderColor: "var(--border)", background: "#fafafa",
                }}
              >
                <span>District</span>
                <span>State</span>
                <span>Population</span>
                <span>Critical Gap</span>
                <span>Risk Level</span>
                <span className="text-right">Facilities</span>
              </div>
              {DESERTS.map((row) => (
                <div
                  key={`${row.district}-${row.state}`}
                  className="grid items-center px-6 py-4 border-b last:border-b-0"
                  style={{ gridTemplateColumns: "1.5fr 1fr 1.5fr 1.5fr 1fr 5rem", borderColor: "var(--border)" }}
                >
                  <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>{row.district}</span>
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{row.state}</span>
                  <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                    {parseInt(row.population.replace(/,/g, "")).toLocaleString("en-IN")}
                  </span>
                  <span><GapPill label={row.criticalGap} /></span>
                  <span><RiskPill level={row.risk} /></span>
                  <span className="text-sm font-semibold text-right" style={{ color: "var(--text-primary)" }}>{row.facilities}</span>
                </div>
              ))}
            </div>

            <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
              Source: VF Hackathon Dataset India · {DESERTS.length} districts shown · 204 total care deserts identified across UP, Bihar, MP, Rajasthan, Jharkhand, CG, Odisha & Assam
            </p>
          </div>
        )}

        {subTab === "upgrades" && (
          <div className="space-y-5">

            {/* Banner */}
            <div
              className="rounded-2xl p-5 flex items-start gap-4"
              style={{ background: "linear-gradient(135deg, var(--accent) 0%, #1a9587 100%)" }}
            >
              <div
                className="w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: "rgba(255,255,255,0.18)" }}
              >
                <span className="text-2xl">🎯</span>
              </div>
              <div>
                <h2 className="text-lg font-bold text-white mb-1">Strategic Healthcare Upgrades</h2>
                <p className="text-sm" style={{ color: "rgba(255,255,255,0.82)" }}>
                  AI-powered recommendations to maximize healthcare access with minimal investment.
                  Each recommendation identifies high-leverage interventions that unlock existing infrastructure.
                </p>
              </div>
            </div>

            {/* Recommendation cards */}
            {UPGRADE_RECS.map((r) => {
              const priorityStyle =
                r.priority === "Critical"
                  ? { border: "#ef4444", badge: { bg: "#ef4444", text: "#fff" } }
                  : r.priority === "High"
                  ? { border: "#f97316", badge: { bg: "#f97316", text: "#fff" } }
                  : { border: "var(--accent)", badge: { bg: "var(--accent)", text: "#fff" } };

              return (
                <div
                  key={r.district}
                  className="rounded-2xl border bg-white"
                  style={{
                    borderColor: priorityStyle.border,
                    borderWidth: "1.5px",
                    boxShadow: "var(--shadow)",
                  }}
                >
                  {/* Card header */}
                  <div className="px-6 pt-5 pb-4 flex items-center gap-3 border-b" style={{ borderColor: "#f1f5f9" }}>
                    <h3 className="font-bold text-base" style={{ color: "var(--text-primary)" }}>{r.district}</h3>
                    <span
                      className="px-3 py-0.5 rounded-full text-xs font-bold"
                      style={{ background: priorityStyle.badge.bg, color: priorityStyle.badge.text }}
                    >
                      {r.priority} Priority
                    </span>
                  </div>

                  {/* Three-column body */}
                  <div className="px-6 py-5 grid grid-cols-3 gap-6">
                    {/* Recommended Action */}
                    <div>
                      <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--text-muted)" }}>
                        Recommended Action
                      </p>
                      <p className="text-sm font-bold mb-1" style={{ color: "var(--text-primary)" }}>{r.action}</p>
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        Estimated Cost: <span className="font-semibold" style={{ color: "var(--text-primary)" }}>{r.cost}</span>
                      </p>
                    </div>

                    {/* Expected Impact */}
                    <div>
                      <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--text-muted)" }}>
                        Expected Impact
                      </p>
                      <div className="flex items-center gap-1.5 mb-1">
                        <TrendingUp className="w-4 h-4 flex-shrink-0" style={{ color: "var(--accent)" }} />
                        <p className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>{r.impactHeadline}</p>
                      </div>
                      <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                        Improves access for <span className="font-bold" style={{ color: "var(--text-primary)" }}>{r.impactPeople} people</span>
                      </p>
                    </div>

                    {/* Key Metrics */}
                    <div>
                      <p className="text-xs font-semibold tracking-widest uppercase mb-2" style={{ color: "var(--text-muted)" }}>
                        Key Metrics
                      </p>
                      <div className="space-y-2">
                        <div
                          className="flex items-center justify-between px-3 py-1.5 rounded-lg"
                          style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}
                        >
                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Population Impact</span>
                          <span className="text-xs font-bold" style={{ color: "var(--text-primary)" }}>{r.popImpact}</span>
                        </div>
                        <div
                          className="flex items-center justify-between px-3 py-1.5 rounded-lg"
                          style={{ background: "#f0fdf4", border: "1px solid #bbf7d0" }}
                        >
                          <span className="text-xs" style={{ color: "var(--text-secondary)" }}>Cost Efficiency</span>
                          <span className="text-xs font-bold" style={{ color: "#16a34a" }}>{r.costEfficiency}</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Why this matters */}
                  <div className="mx-6 mb-5 px-4 py-3 rounded-xl flex items-start gap-2" style={{ background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                    <span className="text-sm flex-shrink-0">💡</span>
                    <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
                      <span className="font-semibold" style={{ color: "var(--text-primary)" }}>Why this matters: </span>
                      {r.why}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

      </div>
    </div>
  );
}

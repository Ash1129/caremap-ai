"use client";

// ── Data — real from VF_Hackathon_Dataset_India_Large.xlsx ────────────────────
// Districts with 2–10 indexed facilities in underserved states,
// sorted by population impact × gap severity.

const SUMMARY_STATS = [
  { value: "204",  label: "Desert Districts",         color: "#ef4444" },
  { value: "312M", label: "People at Risk",            color: "#f97316" },
  { value: "99%",  label: "Missing Anesthesiologist",  color: "#1c2b3a" },
];

type RiskLevel = "CRITICAL" | "HIGH" | "MEDIUM";

interface DesertRow {
  district: string;
  state: string;
  population: string;
  criticalGap: string;
  risk: RiskLevel;
  facilities: number;
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

// ── Risk badge ────────────────────────────────────────────────────────────────

function RiskPill({ level }: { level: RiskLevel }) {
  const styles: Record<RiskLevel, { bg: string; text: string }> = {
    CRITICAL: { bg: "#fee2e2", text: "#dc2626" },
    HIGH:     { bg: "#fee2e2", text: "#dc2626" },
    MEDIUM:   { bg: "#fef9c3", text: "#ca8a04" },
  };
  const s = styles[level];
  return (
    <span
      className="px-3 py-1 rounded-full text-xs font-bold tracking-wide"
      style={{ background: s.bg, color: s.text }}
    >
      {level}
    </span>
  );
}

// ── Gap pill ──────────────────────────────────────────────────────────────────

function GapPill({ label }: { label: string }) {
  return (
    <span
      className="px-3 py-1 rounded-full text-xs font-semibold"
      style={{ background: "#fef9c3", color: "#854d0e" }}
    >
      {label}
    </span>
  );
}

// ── Main view ─────────────────────────────────────────────────────────────────

export function MedicalDesertsView() {
  return (
    <div className="flex-1 overflow-y-auto" style={{ background: "var(--bg)" }}>
      <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold mb-1" style={{ color: "var(--text-primary)" }}>
            Medical Deserts
          </h1>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            Districts identified as high-risk care deserts — ranked by population impact and gap severity
          </p>
        </div>

        {/* Summary stat cards */}
        <div className="grid grid-cols-3 gap-4">
          {SUMMARY_STATS.map((s) => (
            <div
              key={s.label}
              className="rounded-2xl border bg-white p-6"
              style={{ borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
            >
              <div className="text-4xl font-bold mb-2" style={{ color: s.color }}>{s.value}</div>
              <div className="text-sm" style={{ color: "var(--text-muted)" }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* Table */}
        <div
          className="rounded-2xl border bg-white overflow-hidden"
          style={{ borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
        >
          {/* Column headers */}
          <div
            className="grid px-6 py-3 text-xs font-semibold uppercase tracking-widest border-b"
            style={{
              gridTemplateColumns: "1.5fr 1fr 1.5fr 1.5fr 1fr 5rem",
              color: "var(--text-muted)",
              borderColor: "var(--border)",
              background: "#fafafa",
            }}
          >
            <span>District</span>
            <span>State</span>
            <span>Population</span>
            <span>Critical Gap</span>
            <span>Risk Level</span>
            <span className="text-right">Facilities</span>
          </div>

          {/* Rows */}
          {DESERTS.map((row, i) => (
            <div
              key={`${row.district}-${row.state}`}
              className="grid items-center px-6 py-4 border-b last:border-b-0"
              style={{
                gridTemplateColumns: "1.5fr 1fr 1.5fr 1.5fr 1fr 5rem",
                borderColor: "var(--border)",
              }}
            >
              <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                {row.district}
              </span>
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {row.state}
              </span>
              <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {parseInt(row.population).toLocaleString("en-IN")}
              </span>
              <span><GapPill label={row.criticalGap} /></span>
              <span><RiskPill level={row.risk} /></span>
              <span className="text-sm font-semibold text-right" style={{ color: "var(--text-primary)" }}>
                {row.facilities}
              </span>
            </div>
          ))}
        </div>

        {/* Footer note */}
        <p className="text-xs text-center" style={{ color: "var(--text-muted)" }}>
          Source: VF Hackathon Dataset India · {DESERTS.length} districts shown · 204 total care deserts identified across UP, Bihar, MP, Rajasthan, Jharkhand, CG, Odisha & Assam
        </p>
      </div>
    </div>
  );
}

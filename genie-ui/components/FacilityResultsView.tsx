"use client";

import { useState } from "react";
import { ArrowUp, ArrowDown, CheckCircle, XCircle, MapPin, FileText, ShieldCheck, TrendingUp, ChevronDown, ChevronUp } from "lucide-react";
import type { GenieQueryResult } from "@/lib/types";
import { TrustGauge } from "./TrustGauge";
import { TrustBreakdownModal, type ModalFacility } from "./TrustBreakdownModal";

// ── Column helpers ────────────────────────────────────────────────────────────

function colIdx(cols: { name: string }[], ...names: string[]): number {
  for (const n of names) {
    const i = cols.findIndex((c) => c.name.toLowerCase() === n.toLowerCase());
    if (i >= 0) return i;
  }
  return -1;
}

function val(row: string[], idx: number): string {
  return idx >= 0 ? (row[idx] ?? "") : "";
}

// ── Capability display names ──────────────────────────────────────────────────

const CAP_LABELS: Record<string, string> = {
  has_icu:               "ICU",
  has_oxygen:            "Oxygen Supply",
  has_ventilator:        "Ventilator",
  has_emergency_surgery: "Emergency Surgery",
  has_anesthesiologist:  "Anesthesiologist",
  has_dialysis:          "Dialysis",
  has_oncology:          "Oncology",
  has_trauma_care:       "Trauma Care",
  has_neonatal_care:     "Neonatal Care",
  availability_24_7:     "24/7 Availability",
};

function capLabel(colName: string): string {
  const k = colName.toLowerCase();
  return (
    CAP_LABELS[k] ??
    k.replace(/^has_/, "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
  );
}

// ── Facility data extraction ──────────────────────────────────────────────────

interface Facility {
  name: string;
  trustScore: number;
  address?: string;
  city?: string;
  state?: string;
  pinCode?: string;
  capabilities: { label: string; present: boolean }[];
  raw: Record<string, string>;
}

function extractFacilities(result: GenieQueryResult): Facility[] {
  const { columns, rows } = result;

  const nameI    = colIdx(columns, "name");
  const trustI   = colIdx(columns, "trust_score", "trust score", "score");
  const addrI    = colIdx(columns, "full_address", "address", "address_line1");
  const cityI    = colIdx(columns, "district_city", "city", "address_city");
  const stateI   = colIdx(columns, "state", "address_stateorregion");
  const pinI     = colIdx(columns, "pin_code", "address_ziporpostcode", "zip");

  const capCols = columns
    .map((c, i) => ({ col: c, i }))
    .filter(({ col }) => {
      const n = col.name.toLowerCase();
      return n.startsWith("has_") || n === "availability_24_7";
    });

  return rows.map((row) => {
    const raw: Record<string, string> = {};
    columns.forEach((c, i) => { raw[c.name] = row[i] ?? ""; });

    const caps = capCols.map(({ col, i }) => ({
      label:   capLabel(col.name),
      present: ["true", "1", "yes"].includes((row[i] ?? "").toLowerCase()),
    }));

    return {
      name:       val(row, nameI) || "Unknown Facility",
      trustScore: parseInt(val(row, trustI)) || 0,
      address:    addrI >= 0 ? val(row, addrI) : undefined,
      city:       cityI >= 0 ? val(row, cityI) : undefined,
      state:      stateI >= 0 ? val(row, stateI) : undefined,
      pinCode:    pinI >= 0 ? val(row, pinI) : undefined,
      capabilities: caps,
      raw,
    };
  });
}

// ── Trust badge ───────────────────────────────────────────────────────────────

function TrustBadge({ score }: { score: number }) {
  const { label, bg, text } =
    score >= 70 ? { label: "High Trust",    bg: "#dcfce7", text: "#15803d" } :
    score >= 45 ? { label: "Med Trust",     bg: "#fef3c7", text: "#92400e" } :
                  { label: "Low Trust",     bg: "#fee2e2", text: "#991b1b" };
  return (
    <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: bg, color: text }}>
      {label}
    </span>
  );
}

// ── Individual facility card ──────────────────────────────────────────────────

function FacilityCard({
  facility,
  selected,
  onClick,
  onBreakdown,
}: {
  facility: Facility;
  selected: boolean;
  onClick: () => void;
  onBreakdown: () => void;
}) {
  const { name, trustScore, address, city, state, pinCode, capabilities } = facility;
  const location = [city, state, pinCode].filter(Boolean).join(", ") || address?.split(",").slice(-2).join(", ");
  const verified = trustScore >= 70;

  const presentCaps   = capabilities.filter((c) => c.present);
  const missingCaps   = capabilities.filter((c) => !c.present);
  const displayedCaps = [...presentCaps, ...missingCaps].slice(0, 5);

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl border p-5 transition-all"
      style={{
        background: "var(--bg-card)",
        borderColor: selected ? "var(--accent)" : "var(--border)",
        boxShadow: selected ? "0 0 0 2px var(--accent-light), var(--shadow-md)" : "var(--shadow)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        {/* Left */}
        <div className="flex-1 min-w-0">
          {/* Name + badge */}
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className="font-semibold text-base" style={{ color: "var(--text-primary)" }}>
              {name}
            </h3>
            {verified && (
              <CheckCircle className="w-4 h-4 flex-shrink-0" style={{ color: "var(--accent)" }} />
            )}
          </div>

          {/* Location */}
          {location && (
            <div className="flex items-center gap-1 mb-3">
              <MapPin className="w-3.5 h-3.5 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
              <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{location}</span>
            </div>
          )}

          {/* Trust badge */}
          <div className="mb-3">
            <TrustBadge score={trustScore} />
          </div>

          {/* Capabilities */}
          {displayedCaps.length > 0 && (
            <div>
              <p className="text-xs font-semibold mb-2" style={{ color: "var(--accent)" }}>
                Verified Capabilities:
              </p>
              <div className="space-y-1.5">
                {displayedCaps.map((cap) => (
                  <div key={cap.label} className="flex items-center gap-2">
                    {cap.present ? (
                      <CheckCircle className="w-3.5 h-3.5 flex-shrink-0 text-green-500" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 flex-shrink-0 text-red-400" />
                    )}
                    <span
                      className="text-xs"
                      style={{ color: cap.present ? "var(--text-primary)" : "var(--text-muted)" }}
                    >
                      {cap.label}
                      {!cap.present && " — not listed"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Evidence link */}
          <button
            onClick={(e) => { e.stopPropagation(); onBreakdown(); }}
            className="mt-4 pt-3 border-t w-full flex items-center justify-center gap-1.5 text-xs font-medium transition-colors"
            style={{ borderColor: "var(--border)", color: "var(--accent)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent-hover)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--accent)")}
          >
            <FileText className="w-3.5 h-3.5" />
            View Full Evidence &amp; Trust Breakdown →
          </button>
        </div>

        {/* Right — trust gauge */}
        <div className="flex-shrink-0">
          <TrustGauge score={trustScore} />
        </div>
      </div>
    </button>
  );
}

// ── Right panel ───────────────────────────────────────────────────────────────

function DetailPanel({ facility }: { facility: Facility | null }) {
  if (!facility) {
    return (
      <div
        className="rounded-2xl border p-6 flex flex-col items-center justify-center text-center h-48"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
      >
        <ShieldCheck className="w-10 h-10 mb-3" style={{ color: "var(--text-muted)" }} />
        <p className="font-semibold text-sm mb-1" style={{ color: "var(--text-primary)" }}>Select a facility</p>
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Click on any facility card to view detailed trust score breakdown and evidence
        </p>
      </div>
    );
  }

  const { name, trustScore, address, city, state, pinCode, capabilities } = facility;
  return (
    <div
      className="rounded-2xl border p-5 space-y-4"
      style={{ background: "var(--bg-card)", borderColor: "var(--accent)", boxShadow: "var(--shadow-md)" }}
    >
      <div>
        <h3 className="font-semibold text-sm mb-1" style={{ color: "var(--text-primary)" }}>{name}</h3>
        {(city || state) && (
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
            {[city, state, pinCode].filter(Boolean).join(", ")}
          </p>
        )}
        {address && !city && (
          <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{address}</p>
        )}
      </div>

      <div className="flex justify-center">
        <TrustGauge score={trustScore} size="md" />
      </div>

      {capabilities.length > 0 && (
        <div>
          <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>Capabilities</p>
          <div className="space-y-1.5">
            {capabilities.map((cap) => (
              <div key={cap.label} className="flex items-center gap-2">
                {cap.present
                  ? <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 text-red-400 flex-shrink-0" />}
                <span className="text-xs" style={{ color: cap.present ? "var(--text-primary)" : "var(--text-muted)" }}>
                  {cap.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* All raw fields */}
      <div>
        <p className="text-xs font-semibold mb-2" style={{ color: "var(--text-secondary)" }}>All data</p>
        <div className="space-y-1 max-h-40 overflow-y-auto">
          {Object.entries(facility.raw)
            .filter(([k, v]) => v && !["name", "trust_score"].includes(k.toLowerCase()))
            .map(([k, v]) => (
              <div key={k} className="flex gap-2 text-xs">
                <span className="flex-shrink-0 font-medium" style={{ color: "var(--text-secondary)" }}>
                  {k}:
                </span>
                <span className="truncate" style={{ color: "var(--text-primary)" }}>{v}</span>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// ── Route comparison panel ────────────────────────────────────────────────────

function RouteComparisonPanel({ facilities }: { facilities: Facility[] }) {
  const top3 = facilities.slice(0, 3);
  const best = top3[0];

  function capStatus(f: Facility) {
    if (f.capabilities.length === 0) return f.trustScore >= 70 ? "full" : "limited";
    const presentCount = f.capabilities.filter((c) => c.present).length;
    const ratio = presentCount / f.capabilities.length;
    return ratio >= 0.6 ? "full" : "limited";
  }

  function distanceLabel(f: Facility): string | null {
    const d =
      f.raw["distance_km"] ??
      f.raw["distance"] ??
      f.raw["km_away"] ??
      f.raw["dist_km"] ??
      null;
    if (!d || isNaN(parseFloat(d))) return null;
    return `${parseFloat(d).toFixed(0)} km away`;
  }

  const scoreColor = (score: number) =>
    score >= 70 ? "#22c55e" : score >= 45 ? "#f59e0b" : "#ef4444";

  return (
    <div
      className="rounded-2xl border p-5 space-y-4"
      style={{ background: "var(--bg-card)", borderColor: "var(--accent)", boxShadow: "var(--shadow-md)" }}
    >
      {/* Panel header */}
      <div className="flex items-center gap-2">
        <TrendingUp className="w-4 h-4" style={{ color: "var(--accent)" }} />
        <h3 className="font-bold text-sm" style={{ color: "var(--text-primary)" }}>Care Route Comparison</h3>
      </div>

      {/* Facility mini-cards */}
      <div className="flex gap-3">
        {top3.map((f, idx) => {
          const isFirst = idx === 0;
          const status = capStatus(f);
          const dist = distanceLabel(f);
          const color = scoreColor(f.trustScore);

          return (
            <div
              key={f.name}
              className="flex-1 min-w-0 rounded-xl border p-3 relative"
              style={{
                borderColor: isFirst ? "var(--accent)" : "var(--border)",
                borderWidth: isFirst ? "2px" : "1px",
                background: "var(--bg-card)",
              }}
            >
              {/* Recommended badge */}
              {isFirst && (
                <div
                  className="absolute -top-3 left-3 flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  <CheckCircle className="w-3 h-3" />
                  RECOMMENDED
                </div>
              )}

              <div className="flex items-start justify-between gap-2 mt-1">
                <p className="text-xs font-semibold leading-snug" style={{ color: "var(--text-primary)" }}>
                  {f.name}
                </p>
                {/* Circle score */}
                <div
                  className="flex-shrink-0 w-9 h-9 rounded-full border-2 flex items-center justify-center text-xs font-bold"
                  style={{ borderColor: color, color }}
                >
                  {f.trustScore}
                </div>
              </div>

              {dist && (
                <div className="flex items-center gap-1 mt-2">
                  <MapPin className="w-3 h-3 flex-shrink-0" style={{ color: "var(--text-muted)" }} />
                  <span className="text-xs" style={{ color: "var(--text-secondary)" }}>{dist}</span>
                </div>
              )}

              {/* Capability status pill */}
              <div
                className="mt-2 px-2 py-1 rounded-lg text-xs font-medium flex items-center gap-1"
                style={
                  status === "full"
                    ? { background: "#f0fdf4", color: "#15803d" }
                    : { background: "#fff1f2", color: "#be123c" }
                }
              >
                {status === "full"
                  ? <><CheckCircle className="w-3 h-3" /> Fully capable</>
                  : <><span className="text-xs">⚠</span> Limited capability</>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Decision Insight */}
      <div className="rounded-xl p-4 space-y-3" style={{ background: "var(--bg-nav)" }}>
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4" style={{ color: "var(--accent)" }} />
          <span className="text-sm font-bold text-white">Decision Insight</span>
        </div>
        <p className="text-sm text-white/80">
          <span className="font-semibold text-white">{best.name}</span> is the facility with the highest Trust Score.
        </p>
        <div
          className="px-3 py-2 rounded-lg text-sm flex items-center gap-2"
          style={{ background: "rgba(44,181,163,0.15)", color: "var(--accent)", border: "1px solid rgba(44,181,163,0.3)" }}
        >
          <CheckCircle className="w-4 h-4 flex-shrink-0" />
          <span>
            <span className="font-semibold">Recommendation: </span>
            Travel to {best.name} for higher care quality
          </span>
        </div>
      </div>
    </div>
  );
}

// ── Main results view ─────────────────────────────────────────────────────────

interface Props {
  result: GenieQueryResult;
}

export function FacilityResultsView({ result }: Props) {
  const [selected,       setSelected]       = useState<Facility | null>(null);
  const [breakdown,      setBreakdown]      = useState<ModalFacility | null>(null);
  const [sortDir,        setSortDir]        = useState<"asc" | "desc">("desc");
  const [showRouteComp,  setShowRouteComp]  = useState(false);

  const allFacilities = extractFacilities(result);
  const facilities = [...allFacilities].sort((a, b) =>
    sortDir === "asc" ? a.trustScore - b.trustScore : b.trustScore - a.trustScore
  );

  const toggle = (f: Facility) => setSelected((prev) => (prev?.name === f.name ? null : f));
  const flipSort = () => setSortDir((d) => (d === "asc" ? "desc" : "asc"));

  return (
    <>
      <div className="space-y-4">
        {/* Results header */}
        <div
          className="rounded-2xl border px-5 py-4 flex items-center justify-between"
          style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
        >
          <div>
            <p className="text-xs mb-0.5" style={{ color: "var(--text-muted)" }}>Search Results</p>
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
              Found {facilities.length} facilit{facilities.length === 1 ? "y" : "ies"} · Ranked by Trust Score
            </p>
          </div>
          <button
            onClick={flipSort}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all"
            style={{
              borderColor: "var(--border)",
              color: "var(--text-secondary)",
              background: "var(--bg-sidebar)",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "var(--accent)";
              e.currentTarget.style.color = "var(--accent)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "var(--border)";
              e.currentTarget.style.color = "var(--text-secondary)";
            }}
            title={sortDir === "desc" ? "Sort: highest trust first" : "Sort: lowest trust first"}
          >
            {sortDir === "desc"
              ? <><ArrowDown className="w-3.5 h-3.5" /> Highest first</>
              : <><ArrowUp   className="w-3.5 h-3.5" /> Lowest first</>}
          </button>
        </div>

        {/* Route comparison toggle */}
        <button
          onClick={() => setShowRouteComp((v) => !v)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: showRouteComp ? "var(--accent)" : "var(--accent-light)",
            color: showRouteComp ? "#fff" : "var(--accent)",
            border: "1.5px solid var(--accent)",
          }}
        >
          <TrendingUp className="w-4 h-4" />
          {showRouteComp ? "Hide Route Comparison" : "Show Route Comparison"}
          {showRouteComp ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>

        {/* Route comparison panel */}
        {showRouteComp && <RouteComparisonPanel facilities={facilities} />}

        {/* Cards + detail panel */}
        <div className="flex gap-4 items-start">
          <div className="flex-1 min-w-0 space-y-3">
            {facilities.map((f) => (
              <FacilityCard
                key={f.name}
                facility={f}
                selected={selected?.name === f.name}
                onClick={() => toggle(f)}
                onBreakdown={() => setBreakdown(f)}
              />
            ))}
          </div>
          <div className="w-64 flex-shrink-0 sticky top-4">
            <DetailPanel facility={selected} />
          </div>
        </div>
      </div>

      {/* Trust breakdown modal */}
      {breakdown && (
        <TrustBreakdownModal
          facility={breakdown}
          onClose={() => setBreakdown(null)}
        />
      )}
    </>
  );
}

// ── Detection helper (used by ChatMessage) ────────────────────────────────────

export function isFacilityResult(result: GenieQueryResult): boolean {
  const names = result.columns.map((c) => c.name.toLowerCase());
  return (
    names.some((n) => n === "name") &&
    names.some((n) => n.includes("trust"))
  );
}

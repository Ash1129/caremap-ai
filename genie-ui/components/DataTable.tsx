"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, ChevronsUpDown, Download, TableIcon } from "lucide-react";
import type { GenieQueryResult } from "@/lib/types";

interface Props { result: GenieQueryResult; }

type SortDir = "asc" | "desc" | null;

export function DataTable({ result }: Props) {
  const { columns, rows, row_count, truncated } = result;
  const [sortCol, setSortCol] = useState<number | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const sortedRows = [...rows].sort((a, b) => {
    if (sortCol === null || !sortDir) return 0;
    const av = a[sortCol] ?? "", bv = b[sortCol] ?? "";
    const an = parseFloat(av), bn = parseFloat(bv);
    const cmp = !isNaN(an) && !isNaN(bn) ? an - bn : av.localeCompare(bv);
    return sortDir === "asc" ? cmp : -cmp;
  });

  const toggleSort = (idx: number) => {
    if (sortCol !== idx) { setSortCol(idx); setSortDir("asc"); return; }
    setSortDir((d) => d === "asc" ? "desc" : null);
    if (sortDir === "desc") setSortCol(null);
  };

  const downloadCSV = () => {
    const header = columns.map((c) => `"${c.name}"`).join(",");
    const body   = rows.map((r) => r.map((v) => `"${(v ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob   = new Blob([header + "\n" + body], { type: "text/csv" });
    const a      = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: "results.csv" });
    a.click(); URL.revokeObjectURL(a.href);
  };

  if (!columns.length) return null;

  return (
    <div className="rounded-xl overflow-hidden border" style={{ borderColor: "var(--border)", boxShadow: "var(--shadow)" }}>

      {/* Toolbar */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ background: "#f8fafc", borderColor: "var(--border)" }}
      >
        <div className="flex items-center gap-2">
          <TableIcon className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
          <span className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            {row_count.toLocaleString()} row{row_count !== 1 ? "s" : ""}
            {truncated && <span className="ml-1.5 text-amber-500 font-semibold">(truncated)</span>}
          </span>
        </div>
        <button
          onClick={downloadCSV}
          className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
          style={{ color: "var(--text-secondary)" }}
          onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
          onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
        >
          <Download className="w-3.5 h-3.5" /> CSV
        </button>
      </div>

      {/* Table */}
      <div className="overflow-x-auto" style={{ maxHeight: "380px", overflowY: "auto", background: "var(--bg-card)" }}>
        <table className="w-full text-xs border-collapse min-w-max">
          <thead>
            <tr style={{ background: "#f1f5f9" }}>
              {columns.map((col, i) => (
                <th
                  key={i}
                  onClick={() => toggleSort(i)}
                  className="text-left px-4 py-3 border-b font-semibold cursor-pointer select-none whitespace-nowrap"
                  style={{ borderColor: "var(--border)", color: sortCol === i ? "var(--accent)" : "var(--text-secondary)" }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
                  onMouseLeave={(e) => (e.currentTarget.style.color = sortCol === i ? "var(--accent)" : "var(--text-secondary)")}
                >
                  <span className="flex items-center gap-1">
                    {col.name}
                    {sortCol === i
                      ? sortDir === "asc" ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                      : <ChevronsUpDown className="w-3 h-3 opacity-30" />}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((row, ri) => (
              <tr
                key={ri}
                style={{ background: ri % 2 === 0 ? "var(--bg-card)" : "#f8fafc" }}
                onMouseEnter={(e) => (e.currentTarget.style.background = "var(--accent-light)")}
                onMouseLeave={(e) => (e.currentTarget.style.background = ri % 2 === 0 ? "var(--bg-card)" : "#f8fafc")}
              >
                {row.map((cell, ci) => (
                  <td
                    key={ci}
                    className="px-4 py-2.5 border-b whitespace-nowrap max-w-xs truncate"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                    title={cell ?? ""}
                  >
                    {cell ?? <span style={{ color: "var(--text-muted)" }}>null</span>}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

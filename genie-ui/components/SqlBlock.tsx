"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Database } from "lucide-react";

interface Props {
  sql: string;
  description?: string;
}

function highlightSQL(sql: string): string {
  const keywords =
    /\b(SELECT|FROM|WHERE|JOIN|LEFT|RIGHT|INNER|OUTER|ON|GROUP\s+BY|ORDER\s+BY|HAVING|LIMIT|OFFSET|UNION|ALL|DISTINCT|AS|AND|OR|NOT|IN|LIKE|BETWEEN|IS|NULL|CASE|WHEN|THEN|ELSE|END|WITH|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER|TABLE|VIEW|INDEX|INTO|VALUES|SET|COUNT|SUM|AVG|MIN|MAX|COALESCE|NULLIF|CAST|CONCAT|ROUND|FLOOR|CEIL|DATE|YEAR|MONTH|DAY|TRIM|UPPER|LOWER)\b/gi;
  const strings  = /('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")/g;
  const numbers  = /\b(\d+(?:\.\d+)?)\b/g;
  const comments = /(--[^\n]*|\/\*[\s\S]*?\*\/)/g;

  return sql
    .replace(comments, (m) => `<span class="sql-comment">${m}</span>`)
    .replace(strings,  (m) => `<span class="sql-string">${m}</span>`)
    .replace(numbers,  (m) => `<span class="sql-number">${m}</span>`)
    .replace(keywords, (m) => `<span class="sql-keyword">${m.toUpperCase()}</span>`);
}

export function SqlBlock({ sql, description }: Props) {
  const [copied,   setCopied]   = useState(false);
  const [expanded, setExpanded] = useState(true);

  const copy = async () => {
    await navigator.clipboard.writeText(sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="rounded-xl overflow-hidden text-sm border"
      style={{ background: "var(--code-bg)", borderColor: "var(--code-border)", boxShadow: "var(--shadow-sm)" }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: "var(--code-border)", background: "#f1f5f9" }}
      >
        <div className="flex items-center gap-2">
          <Database className="w-3.5 h-3.5" style={{ color: "var(--accent)" }} />
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-secondary)" }}>SQL</span>
          {description && (
            <span className="text-xs truncate max-w-xs" style={{ color: "var(--text-muted)" }}>— {description}</span>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={copy}
            className="flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--accent)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          >
            {copied
              ? <><Check className="w-3.5 h-3.5 text-green-500" /><span className="text-green-500">Copied</span></>
              : <><Copy className="w-3.5 h-3.5" /><span>Copy</span></>}
          </button>
          <button
            onClick={() => setExpanded((x) => !x)}
            className="p-1 rounded transition-colors"
            style={{ color: "var(--text-secondary)" }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-secondary)")}
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {expanded && (
        <pre
          className="px-4 py-4 overflow-x-auto text-xs leading-relaxed font-mono"
          style={{ color: "var(--text-primary)" }}
          dangerouslySetInnerHTML={{ __html: highlightSQL(sql) }}
        />
      )}
    </div>
  );
}

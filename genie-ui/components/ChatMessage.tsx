"use client";

import { AlertTriangle } from "lucide-react";
import type { ChatMessage } from "@/lib/types";
import { SqlBlock } from "./SqlBlock";
import { DataTable } from "./DataTable";
import { FacilityResultsView, isFacilityResult } from "./FacilityResultsView";

interface Props {
  message: ChatMessage;
  onSuggest?: (q: string) => void;
}

export function ChatMessageComponent({ message, onSuggest }: Props) {

  /* ── User message ─────────────────────────────────────────────────────── */
  if (message.role === "user") {
    return (
      <div className="flex justify-end msg-enter">
        <div
          className="max-w-xl px-4 py-3 rounded-2xl rounded-br-sm text-sm leading-relaxed"
          style={{
            background: "var(--user-bubble)",
            color: "var(--user-bubble-text)",
            boxShadow: "var(--shadow-sm)",
          }}
        >
          {message.content}
        </div>
      </div>
    );
  }

  /* ── Assistant message ────────────────────────────────────────────────── */
  return (
    <div className="flex items-start gap-3 msg-enter">
      {/* Bot avatar */}
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-xs font-bold"
        style={{ background: "var(--accent)" }}
      >
        G
      </div>

      <div className="flex-1 min-w-0 space-y-3">

        {/* Error */}
        {message.error && (
          <div
            className="flex items-start gap-2 px-4 py-3 rounded-xl text-sm border"
            style={{ background: "#fff5f5", borderColor: "#fecaca", color: "#991b1b" }}
          >
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5 text-red-500" />
            <span>{message.error}</span>
          </div>
        )}

        {/* Attachments */}
        {message.attachments?.map((att, i) => {
          if (att.text?.content) {
            return (
              <div
                key={i}
                className="px-5 py-4 rounded-2xl text-sm leading-relaxed border"
                style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
              >
                <FormattedText content={att.text.content} />
              </div>
            );
          }
          if (att.query?.query) {
            return <SqlBlock key={i} sql={att.query.query} description={att.query.description} />;
          }
          if (att.suggested_questions?.questions?.length && onSuggest) {
            return (
              <div key={i} className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
                  Suggested follow-ups
                </p>
                <div className="flex flex-col gap-1.5">
                  {att.suggested_questions.questions.map((q, qi) => (
                    <button
                      key={qi}
                      onClick={() => onSuggest(q)}
                      className="text-left text-sm px-4 py-2.5 rounded-xl border transition-all"
                      style={{
                        background: "var(--bg-card)",
                        borderColor: "var(--border)",
                        color: "var(--text-secondary)",
                        boxShadow: "var(--shadow-sm)",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--accent)";
                        e.currentTarget.style.color = "var(--accent)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--border)";
                        e.currentTarget.style.color = "var(--text-secondary)";
                      }}
                    >
                      ↗ {q}
                    </button>
                  ))}
                </div>
              </div>
            );
          }
          return null;
        })}

        {/* Query results — rich cards for facility data, plain table otherwise */}
        {message.queryResult && message.queryResult.rows.length > 0 && (
          isFacilityResult(message.queryResult)
            ? <FacilityResultsView result={message.queryResult} />
            : <DataTable result={message.queryResult} />
        )}

        {/* Fallback */}
        {!message.error && !message.attachments?.length && !message.queryResult && (
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>No response content.</p>
        )}
      </div>
    </div>
  );
}

/* ── Lightweight inline markdown renderer ─────────────────────────────────── */
function FormattedText({ content }: { content: string }) {
  return (
    <div className="space-y-1.5">
      {content.split("\n").map((line, i) => {
        if (line.startsWith("### "))
          return <h3 key={i} className="font-semibold text-sm mt-2" style={{ color: "var(--text-primary)" }}>{line.slice(4)}</h3>;
        if (line.startsWith("## "))
          return <h2 key={i} className="font-semibold text-base mt-2" style={{ color: "var(--text-primary)" }}>{line.slice(3)}</h2>;
        if (line.startsWith("- ") || line.startsWith("* "))
          return (
            <div key={i} className="flex gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
              <span style={{ color: "var(--accent)" }}>•</span>
              <span>{renderInline(line.slice(2))}</span>
            </div>
          );
        if (/^\d+\.\s/.test(line)) {
          const m = line.match(/^(\d+)\.\s(.*)$/);
          if (m) return (
            <div key={i} className="flex gap-2 text-sm" style={{ color: "var(--text-primary)" }}>
              <span style={{ color: "var(--accent)", minWidth: "1.25rem" }}>{m[1]}.</span>
              <span>{renderInline(m[2])}</span>
            </div>
          );
        }
        if (!line.trim()) return <div key={i} className="h-1" />;
        return <p key={i} className="text-sm" style={{ color: "var(--text-primary)" }}>{renderInline(line)}</p>;
      })}
    </div>
  );
}

function renderInline(text: string): React.ReactNode {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**"))
      return <strong key={i} style={{ color: "var(--text-primary)" }}>{part.slice(2, -2)}</strong>;
    if (part.startsWith("`") && part.endsWith("`"))
      return (
        <code key={i} className="px-1.5 py-0.5 rounded text-xs font-mono"
          style={{ background: "var(--accent-light)", color: "var(--accent)", border: "1px solid #b2e0db" }}>
          {part.slice(1, -1)}
        </code>
      );
    return part;
  });
}

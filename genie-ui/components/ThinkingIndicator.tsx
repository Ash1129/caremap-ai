"use client";

import type { GenieMessageStatus } from "@/lib/types";

const STATUS_LABELS: Record<GenieMessageStatus, string> = {
  SUBMITTED:          "Sending…",
  FILTERING_CONTEXT:  "Understanding context…",
  ASKING_AI:          "Thinking…",
  VALIDATING_SQL:     "Validating SQL…",
  EXECUTING_QUERY:    "Running query against your data…",
  FETCHING_METADATA:  "Fetching schema metadata…",
  PENDING_WAREHOUSE:  "Waiting for warehouse to start…",
  COMPLETED:          "Done",
  FAILED:             "Failed",
  CANCELLED:          "Cancelled",
};

interface Props {
  status: GenieMessageStatus | null;
}

export function ThinkingIndicator({ status }: Props) {
  const label = status ? (STATUS_LABELS[status] ?? "Thinking…") : "Thinking…";

  return (
    <div className="flex items-start gap-3 msg-enter">
      <div
        className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 text-white text-xs font-bold"
        style={{ background: "var(--accent)" }}
      >
        G
      </div>
      <div
        className="flex items-center gap-3 px-5 py-3.5 rounded-2xl border"
        style={{ background: "var(--bg-card)", borderColor: "var(--border)", boxShadow: "var(--shadow)" }}
      >
        <span className="w-2 h-2 rounded-full dot-1 inline-block" style={{ background: "var(--accent)" }} />
        <span className="w-2 h-2 rounded-full dot-2 inline-block" style={{ background: "var(--accent)" }} />
        <span className="w-2 h-2 rounded-full dot-3 inline-block" style={{ background: "var(--accent)" }} />
        <span className="text-sm ml-1" style={{ color: "var(--text-secondary)" }}>{label}</span>
      </div>
    </div>
  );
}

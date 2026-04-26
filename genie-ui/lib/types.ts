// ── Genie API shapes ──────────────────────────────────────────────────────────

export type GenieMessageStatus =
  | "SUBMITTED"
  | "FILTERING_CONTEXT"
  | "ASKING_AI"
  | "VALIDATING_SQL"
  | "EXECUTING_QUERY"
  | "FETCHING_METADATA"
  | "PENDING_WAREHOUSE"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export interface GenieAttachment {
  attachment_id?: string;
  query?: {
    query: string;
    description: string;
    is_truncated?: boolean;
    statement_id?: string;
    query_result_metadata?: { row_count?: number };
  };
  text?: {
    content: string;
  };
  suggested_questions?: {
    questions: string[];
  };
}

export interface GenieColumn {
  name: string;
  type_name: string;
  position: number;
}

export interface GenieQueryResult {
  columns: GenieColumn[];
  rows: string[][];
  row_count: number;
  truncated: boolean;
}

// ── SSE events streamed from /api/genie ──────────────────────────────────────

export type SSEEvent =
  | {
      type: "status";
      status: GenieMessageStatus;
      conversationId: string;
      messageId: string;
    }
  | {
      type: "done";
      conversationId: string;
      messageId: string;
      attachments: GenieAttachment[];
      queryResult?: GenieQueryResult;
    }
  | { type: "error"; message: string };

// ── UI chat model ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
  status?: GenieMessageStatus;
  attachments?: GenieAttachment[];
  queryResult?: GenieQueryResult;
  error?: string;
}

export interface Conversation {
  id: string;
  title: string;
  createdAt: Date;
  messages: ChatMessage[];
}

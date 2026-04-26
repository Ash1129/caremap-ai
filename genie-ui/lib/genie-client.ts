/**
 * Server-side Genie API client.
 * Only imported in API routes — env vars are never sent to the browser.
 */

import type { GenieAttachment, GenieMessageStatus, GenieQueryResult } from "./types";

const HOST = process.env.DATABRICKS_HOST?.replace(/\/$/, "");
const TOKEN = process.env.DATABRICKS_TOKEN;
const SPACE_ID = process.env.DATABRICKS_GENIE_SPACE_ID;

function assertEnv(): void {
  if (!HOST || !TOKEN || !SPACE_ID) {
    throw new Error(
      "Missing required env vars: DATABRICKS_HOST, DATABRICKS_TOKEN, DATABRICKS_GENIE_SPACE_ID"
    );
  }
}

function url(path: string): string {
  return `${HOST}/api/2.0/genie/spaces/${SPACE_ID}${path}`;
}

async function reqRaw<T>(fullUrl: string, method: "GET" | "POST", body?: object): Promise<T> {
  const res = await fetch(fullUrl, {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Databricks API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

async function req<T>(endpoint: string, method: "GET" | "POST", body?: object): Promise<T> {
  const res = await fetch(url(endpoint), {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    // Disable Next.js fetch caching for live API calls
    cache: "no-store",
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`Genie API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
}

// ── Conversation management ───────────────────────────────────────────────────

export async function startConversation(
  content: string
): Promise<{ conversationId: string; messageId: string }> {
  assertEnv();
  const data = await req<{ conversation_id: string; message_id: string }>(
    "/start-conversation",
    "POST",
    { content }
  );
  return { conversationId: data.conversation_id, messageId: data.message_id };
}

export async function sendMessage(
  conversationId: string,
  content: string
): Promise<{ messageId: string }> {
  assertEnv();
  const data = await req<{ message_id: string }>(
    `/conversations/${conversationId}/messages`,
    "POST",
    { content }
  );
  return { messageId: data.message_id };
}

// ── Polling ───────────────────────────────────────────────────────────────────

interface RawMessage {
  id: string;
  conversation_id: string;
  status: GenieMessageStatus;
  attachments?: GenieAttachment[];
  error?: { message: string };
}

export async function getMessage(
  conversationId: string,
  messageId: string
): Promise<RawMessage> {
  assertEnv();
  return req<RawMessage>(
    `/conversations/${conversationId}/messages/${messageId}`,
    "GET"
  );
}

// ── Query results ─────────────────────────────────────────────────────────────

interface RawChunk {
  data_array?: string[][];
  row_count?: number;
  chunk_index?: number;
}

interface RawQueryResult {
  statement_response?: {
    statement_id?: string;
    status?: { state: string };
    manifest?: {
      schema?: {
        columns?: Array<{ name: string; type_name: string; position: number }>;
      };
      truncated?: boolean;
      total_row_count?: number;
      total_chunk_count?: number;
    };
    result?: RawChunk;
  };
}

export async function getQueryResult(
  conversationId: string,
  messageId: string,
  attachmentId: string
): Promise<GenieQueryResult | null> {
  assertEnv();
  const raw = await req<RawQueryResult>(
    `/conversations/${conversationId}/messages/${messageId}/query-result/${attachmentId}`,
    "GET"
  );

  const sr = raw.statement_response;
  if (!sr?.result || !sr?.manifest?.schema?.columns) return null;

  const columns = sr.manifest.schema.columns;
  let rows: string[][] = sr.result.data_array ?? [];
  const totalChunks = sr.manifest.total_chunk_count ?? 1;
  const statementId = sr.statement_id;

  // Fetch remaining chunks if the result is paginated
  if (totalChunks > 1 && statementId) {
    for (let i = 1; i < totalChunks; i++) {
      try {
        const chunk = await reqRaw<RawChunk>(
          `${HOST}/api/2.0/sql/statements/${statementId}/result/chunks/${i}`,
          "GET"
        );
        if (chunk.data_array) rows = [...rows, ...chunk.data_array];
      } catch {
        // Non-fatal: return what we have so far
        break;
      }
    }
  }

  return {
    columns,
    rows,
    row_count: sr.manifest.total_row_count ?? rows.length,
    truncated: sr.manifest.truncated ?? false,
  };
}

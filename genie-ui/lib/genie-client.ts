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

interface RawQueryResult {
  statement_response?: {
    status?: { state: string };
    manifest?: {
      schema?: {
        columns?: Array<{ name: string; type_name: string; position: number }>;
      };
      truncated?: boolean;
    };
    result?: {
      data_array?: string[][];
      row_count?: number;
    };
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

  return {
    columns: sr.manifest.schema.columns,
    rows: sr.result.data_array ?? [],
    row_count: sr.result.row_count ?? 0,
    truncated: sr.manifest.truncated ?? false,
  };
}

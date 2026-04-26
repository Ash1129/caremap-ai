/**
 * POST /api/genie
 *
 * Accepts { content, conversationId? } and returns a Server-Sent Events stream
 * that mirrors the Genie polling lifecycle:
 *
 *   status  → live status while Genie generates + executes SQL
 *   done    → full response once COMPLETED (attachments + optional query rows)
 *   error   → any failure
 *
 * The client never talks to Databricks directly — credentials stay server-side.
 */

import { NextRequest } from "next/server";
import {
  startConversation,
  sendMessage,
  getMessage,
  getQueryResult,
} from "@/lib/genie-client";
import type { GenieMessageStatus, SSEEvent } from "@/lib/types";

const POLL_INTERVAL_MS = 1500;
const MAX_POLLS = 80; // ~2 min ceiling

const TERMINAL: Set<GenieMessageStatus> = new Set([
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export async function POST(req: NextRequest) {
  const { content, conversationId } = (await req.json()) as {
    content: string;
    conversationId?: string | null;
  };

  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      function send(event: SSEEvent) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      }

      try {
        // ── 1. Start or continue conversation ────────────────────────────────
        let convId: string;
        let msgId: string;

        if (conversationId) {
          const r = await sendMessage(conversationId, content);
          convId = conversationId;
          msgId = r.messageId;
        } else {
          const r = await startConversation(content);
          convId = r.conversationId;
          msgId = r.messageId;
        }

        send({ type: "status", status: "SUBMITTED", conversationId: convId, messageId: msgId });

        // ── 2. Poll until terminal status ─────────────────────────────────────
        let polls = 0;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let message: any = null;
        let lastStatus: GenieMessageStatus = "SUBMITTED";

        while (polls < MAX_POLLS) {
          await sleep(POLL_INTERVAL_MS);
          message = await getMessage(convId, msgId);
          const status: GenieMessageStatus = message.status;

          if (status !== lastStatus) {
            send({ type: "status", status, conversationId: convId, messageId: msgId });
            lastStatus = status;
          }

          if (TERMINAL.has(status)) break;
          polls++;
        }

        // ── 3. Handle terminal state ──────────────────────────────────────────
        if (!message || message.status !== "COMPLETED") {
          const reason =
            message?.error?.message ??
            (message?.status === "CANCELLED" ? "Query cancelled" : "Query timed out or failed");
          send({ type: "error", message: reason });
          return;
        }

        // ── 4. Fetch query results if a SQL attachment exists ─────────────────
        const attachments = message.attachments ?? [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const queryAttachment = attachments.find((a: any) => a.query?.query);

        let queryResult = undefined;
        if (queryAttachment?.attachment_id) {
          try {
            const r = await getQueryResult(convId, msgId, queryAttachment.attachment_id);
            if (r) queryResult = r;
          } catch {
            // Non-fatal: text response still useful without result rows
          }
        }

        send({
          type: "done",
          conversationId: convId,
          messageId: msgId,
          attachments,
          queryResult,
        });
      } catch (err) {
        send({
          type: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Allow cross-origin access if embedding the UI elsewhere
      "Access-Control-Allow-Origin": "*",
    },
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

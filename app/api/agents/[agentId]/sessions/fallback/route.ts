import { apiError, handle } from "@/lib/api";
import { fallbackToChat } from "@/lib/paperclip";
import type { NextRequest } from "next/server";

type Ctx = { params: Promise<{ agentId: string }> };

/**
 * A new session got no reply in time: switch to the agent's single /chats conversation.
 * Optionally re-sends the unanswered message there (a chat comment, nothing else).
 */
export function POST(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { body, clientRequestId } = (await req.json().catch(() => ({}))) as { body?: unknown; clientRequestId?: unknown };
    const text = typeof body === "string" && body.trim() ? body.trim() : null;
    if (text && text.length > 20_000) return apiError("bad_request", "Message is too long.", 400);
    const crid = typeof clientRequestId === "string" && /^[A-Za-z0-9-]{8,64}$/.test(clientRequestId) ? clientRequestId : null;
    if (text && !crid) return apiError("bad_request", "Missing clientRequestId.", 400);
    return fallbackToChat((await params).agentId, text, crid);
  });
}

import { apiError, handle } from "@/lib/api";
import { listChatSessions, startChatSession } from "@/lib/paperclip";
import type { NextRequest } from "next/server";

type Ctx = { params: Promise<{ agentId: string }> };

export const dynamic = "force-dynamic";

/** Chat sessions with one agent (read-only). */
export function GET(_req: NextRequest, { params }: Ctx) {
  return handle(async () => listChatSessions((await params).agentId));
}

/**
 * Starts a new chat session with the agent and sends its first message.
 * The only route that creates a Paperclip issue: always assigned to this agent, always marked as a panel chat.
 */
export function POST(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { body, clientRequestId } = (await req.json().catch(() => ({}))) as { body?: unknown; clientRequestId?: unknown };
    if (typeof body !== "string" || !body.trim() || body.length > 20_000)
      return apiError("bad_request", "Message is empty or too long.", 400);
    if (typeof clientRequestId !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(clientRequestId))
      return apiError("bad_request", "Missing clientRequestId.", 400);
    return startChatSession((await params).agentId, body.trim(), clientRequestId);
  });
}

import { apiError, handle } from "@/lib/api";
import { listComments, postComment } from "@/lib/paperclip";
import type { NextRequest } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export function GET(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const after = req.nextUrl.searchParams.get("after") ?? undefined;
    return { comments: await listComments((await params).id, after) };
  });
}

/** Sends a chat message. The only write the panel makes besides opening a chat. */
export function POST(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { body, clientRequestId } = (await req.json().catch(() => ({}))) as { body?: unknown; clientRequestId?: unknown };
    if (typeof body !== "string" || !body.trim() || body.length > 20_000)
      return apiError("bad_request", "Message is empty or too long.", 400);
    if (typeof clientRequestId !== "string" || !/^[A-Za-z0-9-]{8,64}$/.test(clientRequestId))
      return apiError("bad_request", "Missing clientRequestId.", 400);
    return { comment: await postComment((await params).id, body, clientRequestId) };
  });
}

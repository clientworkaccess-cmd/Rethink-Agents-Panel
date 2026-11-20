import { handle } from "@/lib/api";
import { openChat } from "@/lib/paperclip";

type Ctx = { params: Promise<{ agentId: string }> };

/** Opens (or reuses) the chat issue with an agent. */
export function POST(_req: Request, { params }: Ctx) {
  return handle(async () => ({ issue: await openChat((await params).agentId) }));
}

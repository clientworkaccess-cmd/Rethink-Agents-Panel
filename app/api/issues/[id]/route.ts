import { handle } from "@/lib/api";
import { getIssue } from "@/lib/paperclip";

type Ctx = { params: Promise<{ id: string }> };

export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => getIssue((await params).id));
}

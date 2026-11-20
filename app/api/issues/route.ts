import { handle } from "@/lib/api";
import { listIssues } from "@/lib/paperclip";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ({ issues: await listIssues() }));
}

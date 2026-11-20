import { handle } from "@/lib/api";
import { listIssueArtifacts } from "@/lib/paperclip";

type Ctx = { params: Promise<{ id: string }> };

export function GET(_req: Request, { params }: Ctx) {
  return handle(async () => ({ artifacts: await listIssueArtifacts((await params).id) }));
}

import { handle } from "@/lib/api";
import { listRecentArtifacts } from "@/lib/paperclip";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(async () => ({ artifacts: await listRecentArtifacts(30) }));
}

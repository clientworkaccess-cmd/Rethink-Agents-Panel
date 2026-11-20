import { handle } from "@/lib/api";
import { getAgentsAndRuns } from "@/lib/paperclip";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(() => getAgentsAndRuns());
}

import { handle } from "@/lib/api";
import { getOrg } from "@/lib/paperclip";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(() => getOrg());
}

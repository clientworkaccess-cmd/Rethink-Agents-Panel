import { handle } from "@/lib/api";
import { computeMetrics } from "@/lib/metrics";

export const dynamic = "force-dynamic";

export function GET() {
  return handle(() => computeMetrics());
}

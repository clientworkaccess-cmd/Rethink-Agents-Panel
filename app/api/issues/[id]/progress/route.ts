import { handle } from "@/lib/api";
import { getProgress } from "@/lib/paperclip";
import type { NextRequest } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

export function GET(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const sp = req.nextUrl.searchParams;
    const afterSeq = Math.max(0, Number(sp.get("afterSeq")) || 0);
    return getProgress((await params).id, sp.get("runId"), afterSeq);
  });
}

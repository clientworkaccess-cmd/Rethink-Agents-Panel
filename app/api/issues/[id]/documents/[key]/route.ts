import { handle } from "@/lib/api";
import { getDocument } from "@/lib/paperclip";
import type { NextRequest } from "next/server";

type Ctx = { params: Promise<{ id: string; key: string }> };

/** Document body as JSON, or as a .md file with ?download=1. */
export function GET(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const { id, key } = await params;
    const doc = await getDocument(id, key);
    if (req.nextUrl.searchParams.get("download") !== "1") return doc;
    const name = `${key.replace(/[^A-Za-z0-9._-]/g, "_")}.md`;
    return new Response(doc.body, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
}

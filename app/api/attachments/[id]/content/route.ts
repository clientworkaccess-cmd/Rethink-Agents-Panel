import { handle } from "@/lib/api";
import { attachmentContent } from "@/lib/paperclip";
import type { NextRequest } from "next/server";

type Ctx = { params: Promise<{ id: string }> };

// Types that could run script if opened directly on the panel's origin.
const ACTIVE = /html|xml|svg|javascript/;

/** Streams an attachment. Content-Disposition only when downloading (?download=1). */
export function GET(req: NextRequest, { params }: Ctx) {
  return handle(async () => {
    const download = req.nextUrl.searchParams.get("download") === "1";
    const upstream = await attachmentContent((await params).id, download);
    const type = upstream.headers.get("content-type") || "application/octet-stream";
    const headers = new Headers({ "Content-Type": type, "X-Content-Type-Options": "nosniff", "Cache-Control": "private, no-store" });
    const len = upstream.headers.get("content-length");
    if (len) headers.set("Content-Length", len);
    if (download) {
      headers.set("Content-Disposition", upstream.headers.get("content-disposition") || "attachment");
    } else if (ACTIVE.test(type)) {
      headers.set("Content-Security-Policy", "sandbox");
    }
    return new Response(upstream.body, { status: 200, headers });
  });
}

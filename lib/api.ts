// Shared helpers for the panel's route handlers: calm JSON errors, never stack traces.
import { NextResponse } from "next/server";
import { PaperclipError } from "./paperclip";

/** Paperclip 2026.1106 rejects a comment whose clientRequestId is not a UUID, so the panel only accepts UUIDs. */
export const isRequestId = (v: unknown): v is string =>
  typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

export function apiError(error: string, message: string, status: number) {
  return NextResponse.json({ error, message }, { status });
}

export async function handle(fn: () => Promise<Response | unknown>): Promise<Response> {
  try {
    const out = await fn();
    return out instanceof Response ? out : NextResponse.json(out);
  } catch (err) {
    if (err instanceof PaperclipError) {
      if (err.kind === "unreachable") return apiError("paperclip_unreachable", "Paperclip is not reachable.", 503);
      if (err.kind === "config") return apiError("not_configured", "The panel is not configured (PAPERCLIP_COMPANY_ID).", 500);
      if (err.status === 400) return apiError("bad_request", "That request is not valid.", 400);
      if (err.status === 404) return apiError("not_found", "Not found in Paperclip.", 404);
      return apiError("paperclip_error", "Paperclip returned an error.", 502);
    }
    console.error("[panel api]", err instanceof Error ? err.message : err);
    return apiError("internal", "Something went wrong.", 500);
  }
}

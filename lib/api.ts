// Shared helpers for the panel's route handlers: calm JSON errors, never stack traces.
import { NextResponse } from "next/server";
import { PaperclipError } from "./paperclip";
import { VoiceError } from "./voice";

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
    if (err instanceof VoiceError) {
      if (err.kind === "off") return apiError("voice_off", "Voice is not set up on this panel.", 404);
      if (err.kind === "unreachable") return apiError("voice_unreachable", "The voice service is not reachable.", 503);
      if (err.kind === "timeout") return apiError("voice_timeout", "The voice service took too long. Please try again.", 504);
      if (err.status === 413) return apiError("too_large", "That recording is too long.", 413);
      if (err.status === 400 || err.status === 422) return apiError("bad_request", "The voice service could not use that.", 400);
      return apiError("voice_error", "The voice service returned an error.", 502);
    }
    console.error("[panel api]", err instanceof Error ? err.message : err);
    return apiError("internal", "Something went wrong.", 500);
  }
}

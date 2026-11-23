import { apiError, handle } from "@/lib/api";
import { MAX_TTS_CHARS, markdownToSpeech } from "@/lib/speech-text";
import { synthesizeSpeech, voiceMode } from "@/lib/voice";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Read-aloud: {text} (Markdown, at most 6000 characters) to audio/wav. Markdown is stripped here first: code
 * blocks dropped, tables read as "Table omitted.", links as their text. 204 when nothing is left to read.
 * Login is enforced by proxy.ts.
 */
export function POST(req: NextRequest) {
  return handle(async () => {
    const mode = voiceMode();
    if (mode === "off") return apiError("voice_off", "Voice is not set up on this panel.", 404);
    if (mode === "mock") return apiError("voice_mock", "Mock mode reads aloud in the browser.", 409);

    const { text } = (await req.json().catch(() => ({}))) as { text?: unknown };
    if (typeof text !== "string" || !text.trim() || text.length > MAX_TTS_CHARS)
      return apiError("bad_request", `Text is empty or too long (${MAX_TTS_CHARS} characters max).`, 400);
    const speech = markdownToSpeech(text);
    if (!speech) return new Response(null, { status: 204 });

    const res = await synthesizeSpeech(speech);
    return new Response(res.body, {
      headers: { "Content-Type": "audio/wav", "Cache-Control": "no-store" },
    });
  });
}

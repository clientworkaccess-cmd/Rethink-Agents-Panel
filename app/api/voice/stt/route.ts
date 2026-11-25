import { apiError, handle } from "@/lib/api";
import { MAX_AUDIO_BYTES, audioExtension, mockTranscript, transcribeAudio, voiceMode } from "@/lib/voice";
import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

/** Dictation: one recording (multipart field `file`, at most 10 MB) to text. Login is enforced by proxy.ts. */
export function POST(req: NextRequest) {
  return handle(async () => {
    const mode = voiceMode();
    if (mode === "off") return apiError("voice_off", "Voice is not set up on this panel.", 404);

    const declared = Number(req.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_AUDIO_BYTES + 64 * 1024) return apiError("too_large", "That recording is too long (10 MB max).", 413);
    const form = await req.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof Blob) || file.size === 0) return apiError("bad_request", "No recording was received.", 400);
    if (file.size > MAX_AUDIO_BYTES) return apiError("too_large", "That recording is too long (10 MB max).", 413);
    const ext = audioExtension(file.type);
    if (!ext) return apiError("bad_request", "That audio format is not supported.", 400);

    if (mode === "mock") {
      await new Promise((r) => setTimeout(r, 1000));
      return { text: mockTranscript(), audioSeconds: null, seconds: 1 };
    }
    return transcribeAudio(file, ext);
  });
}

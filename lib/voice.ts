// Server side of voice: talks to the voice service (Parakeet STT via sherpa-onnx + Piper TTS, services/voice/) on the VPS.
// Never import from client components. The service URL comes only from VOICE_URL, and only its fixed /stt and
// /tts paths are called, so the routes can never be used as an open proxy.

export type VoiceMode = "off" | "service" | "mock";

export const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const STT_TIMEOUT_MS = 60_000;
const TTS_TIMEOUT_MS = 30_000;

/** Recording formats browsers produce (MediaRecorder) that the service can decode. */
const AUDIO_TYPES: Record<string, string> = {
  "audio/webm": "webm",
  "video/webm": "webm", // some browsers label audio-only webm as video
  "audio/ogg": "ogg",
  "audio/wav": "wav",
  "audio/wave": "wav",
  "audio/x-wav": "wav",
  "audio/mp4": "m4a", // Safari
  "audio/x-m4a": "m4a",
  "audio/aac": "aac",
  "audio/mpeg": "mp3",
};

/** Extension for an accepted audio MIME type (codecs parameter ignored), or null if not accepted. */
export function audioExtension(type: string): string | null {
  return AUDIO_TYPES[type.split(";")[0].trim().toLowerCase()] ?? null;
}

/**
 * off: no voice UI at all. service: VOICE_URL points at the service. mock: PAPERCLIP_MOCK=1 with VOICE_URL
 * empty, or VOICE_URL=mock; STT returns a canned transcript and the browser speaks with speechSynthesis.
 */
export function voiceMode(): VoiceMode {
  const url = (process.env.VOICE_URL || "").trim();
  if (url.toLowerCase() === "mock") return "mock";
  if (!url) return process.env.PAPERCLIP_MOCK === "1" ? "mock" : "off";
  return serviceBase() ? "service" : "off";
}

function serviceBase(): string | null {
  try {
    const u = new URL((process.env.VOICE_URL || "").trim());
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.href.replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export class VoiceError extends Error {
  constructor(
    public kind: "off" | "unreachable" | "timeout" | "status",
    public status = 0,
  ) {
    super(`voice ${kind}${status ? ` ${status}` : ""}`);
  }
}

async function call(path: "/stt" | "/tts", init: RequestInit, timeoutMs: number): Promise<Response> {
  const base = serviceBase();
  if (!base) throw new VoiceError("off");
  let res: Response;
  try {
    res = await fetch(base + path, { ...init, cache: "no-store", signal: AbortSignal.timeout(timeoutMs) });
  } catch (err) {
    const name = err instanceof Error ? err.name : "";
    throw new VoiceError(name === "TimeoutError" || name === "AbortError" ? "timeout" : "unreachable");
  }
  if (!res.ok) throw new VoiceError("status", res.status);
  return res;
}

export async function transcribeAudio(audio: Blob, ext: string): Promise<{ text: string; audioSeconds: number | null; seconds: number | null }> {
  const form = new FormData();
  form.append("file", audio, `recording.${ext}`);
  const res = await call("/stt", { method: "POST", body: form }, STT_TIMEOUT_MS);
  const data = (await res.json().catch(() => null)) as { text?: unknown; audioSeconds?: unknown; seconds?: unknown } | null;
  if (!data || typeof data.text !== "string") throw new VoiceError("status", 502);
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return { text: data.text.trim(), audioSeconds: num(data.audioSeconds), seconds: num(data.seconds) };
}

export async function synthesizeSpeech(text: string, voice: "female" | "male" = "female"): Promise<Response> {
  return call(
    "/tts",
    { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text, voice }) },
    TTS_TIMEOUT_MS,
  );
}

/** Mock mode: canned transcripts on a loop, so dictation and the Talk mode cycle can be demoed. */
const MOCK_TRANSCRIPTS = [
  "Can you give me a quick summary of this week's move-ins, and tell me if anything needs my attention?",
  "How is occupancy trending compared with last month?",
  "Which unit sizes should we look at re-pricing first?",
];
let mockTurn = 0;
export const mockTranscript = () => MOCK_TRANSCRIPTS[mockTurn++ % MOCK_TRANSCRIPTS.length];

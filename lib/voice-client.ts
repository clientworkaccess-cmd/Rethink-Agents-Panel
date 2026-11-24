"use client";
// Browser-side voice primitives: record, listen (silence detection), transcribe, speak, stop. Calls the panel's
// own /api/voice routes only. Kept free of React: dictation (components/voice.tsx) and the hands-free Talk mode
// (components/chat/TalkMode.tsx) are both built on these.
import { markdownToSpeech, splitForSpeech } from "./speech-text";

/** "service": audio from the panel's TTS route. "browser": the browser's own speechSynthesis (mock mode). */
export type VoiceEngine = "service" | "browser";

/** A failure with a message that can be shown to the user as is. */
export class VoiceFailure extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

const friendly = (e: unknown, fallback: string) => (e instanceof VoiceFailure ? e.message : fallback);
export const voiceMessage = (e: unknown) => friendly(e, "Something went wrong with voice. Please try again.");

/* ------------------------------------------------------------------ requests */

async function voiceFetch(path: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store", ...init });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new VoiceFailure("network", "The panel server is not reachable.");
  }
  if (res.status === 401) {
    // full reload on purpose, like lib/client: drop all client state when the session ends
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new VoiceFailure("unauthorized", "Please log in.");
  }
  if (!res.ok) {
    const data = (await res.json().catch(() => null)) as { error?: string; message?: string } | null;
    throw new VoiceFailure(data?.error ?? "error", data?.message ?? "Something went wrong with voice.");
  }
  return res;
}

/** Speech to text through POST /api/voice/stt. Returns the transcript (may be empty if nothing was heard). */
export async function transcribe(audio: Blob, signal?: AbortSignal): Promise<string> {
  const form = new FormData();
  form.append("file", audio, "recording");
  const res = await voiceFetch("/api/voice/stt", { method: "POST", body: form, signal });
  const data = (await res.json().catch(() => null)) as { text?: unknown } | null;
  return typeof data?.text === "string" ? data.text.trim() : "";
}

/** The two reply voices the service offers. "female" (the default) and "male"; per browser, in localStorage. */
export type ReplyVoice = "female" | "male";
export const VOICE_KEY = "panel-voice-voice";
export function replyVoice(): ReplyVoice {
  try {
    return localStorage.getItem(VOICE_KEY) === "male" ? "male" : "female";
  } catch {
    return "female";
  }
}

/** Text (Markdown) to a WAV blob through POST /api/voice/tts, in the chosen reply voice; null when nothing in it is worth reading. */
export async function synthesize(text: string, signal?: AbortSignal): Promise<Blob | null> {
  const res = await voiceFetch("/api/voice/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice: replyVoice() }),
    signal,
  });
  if (res.status === 204) return null;
  return res.blob();
}

/* ------------------------------------------------------------------ recording */

export type Recording = {
  readonly mimeType: string;
  /** Milliseconds since recording started. */
  elapsed(): number;
  /** Current input level, 0 (silence) to 1 (loud). Poll it, e.g. once per animation frame. */
  level(): number;
  /** Stops and returns the recorded audio. */
  stop(): Promise<Blob>;
  /** Stops and throws the audio away. */
  cancel(): void;
};

export type RecordOptions = {
  /** Auto-stop limit in ms (default 3 minutes); `onAutoStop` is called when it is reached. */
  maxMs?: number;
  onAutoStop?: () => void;
};

const PREFERRED_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/ogg;codecs=opus", "audio/mp4"];

function micFailure(e: unknown): VoiceFailure {
  const name = e instanceof DOMException || e instanceof Error ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "PermissionDeniedError")
    return new VoiceFailure("mic_denied", "Microphone access is blocked. Allow it for this site in the browser, then try again.");
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "DevicesNotFoundError")
    return new VoiceFailure("mic_missing", "No microphone was found. Connect one and try again.");
  if (name === "NotReadableError" || name === "AbortError")
    return new VoiceFailure("mic_busy", "The microphone could not be started. Another app may be using it.");
  return new VoiceFailure("mic_error", "The microphone could not be started.");
}

/** True when this page can use the microphone at all (secure context, MediaRecorder present). */
export function canRecord(): boolean {
  return typeof window !== "undefined" && window.isSecureContext && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

/** Asks for the microphone and starts recording (webm/opus when the browser has it, else what it supports). */
export async function startRecording({ maxMs = 180_000, onAutoStop }: RecordOptions = {}): Promise<Recording> {
  if (typeof window === "undefined" || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
    throw new VoiceFailure("insecure", "The microphone needs a secure connection: open the panel over HTTPS or 127.0.0.1.");
  if (typeof MediaRecorder === "undefined") throw new VoiceFailure("unsupported", "This browser cannot record audio.");

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  } catch (e) {
    throw micFailure(e);
  }

  const mimeType = PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    throw new VoiceFailure("unsupported", "This browser cannot record audio.");
  }

  // live level meter
  let ctx: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  let samples: Float32Array<ArrayBuffer> | null = null;
  try {
    ctx = new AudioContext();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    samples = new Float32Array(analyser.fftSize);
    ctx.createMediaStreamSource(stream).connect(analyser);
  } catch {
    ctx = null; // the meter is optional
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  const startedAt = performance.now();
  const timer = setTimeout(() => onAutoStop?.(), maxMs);
  let finished = false;
  const cleanup = () => {
    finished = true;
    clearTimeout(timer);
    stream.getTracks().forEach((t) => t.stop());
    void ctx?.close().catch(() => {});
  };
  recorder.start(250);

  return {
    mimeType: recorder.mimeType || mimeType || "audio/webm",
    elapsed: () => performance.now() - startedAt,
    level() {
      if (!analyser || !samples || finished) return 0;
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const s of samples) sum += s * s;
      return Math.min(1, Math.sqrt(Math.sqrt(sum / samples.length)) * 1.6);
    },
    stop() {
      return new Promise<Blob>((resolve) => {
        if (recorder.state === "inactive") {
          cleanup();
          resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }));
          return;
        }
        recorder.onstop = () => {
          cleanup();
          resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }));
        };
        recorder.stop();
      });
    },
    cancel() {
      recorder.onstop = null;
      if (recorder.state !== "inactive") recorder.stop();
      chunks.length = 0;
      cleanup();
    },
  };
}

/* ------------------------------------------------------------------ hands-free listening */

/**
 * Voice activity detection for Talk mode (documented in the voice PR and README).
 * Primary: Silero VAD v5 in the browser (@ricky0123/vad-web + onnxruntime-web, lazy-loaded when Talk mode
 * opens; model, worklet and wasm served from /vad/, copied there by scripts/copy-vad-assets.mjs).
 * Fallback when it cannot load: an energy detector on an AnalyserNode.
 */
export const LISTEN = {
  /** Silero: frame speech probability that starts speech / ends it. */
  VAD_POSITIVE: 0.5,
  VAD_NEGATIVE: 0.35,
  /** end of speech after this much silence */
  SILENCE_MS: 1000,
  /** speech shorter than this is ignored (a cough, a click) */
  MIN_SPEECH_MS: 400,
  /** audio kept from just before speech started */
  PRE_SPEECH_PAD_MS: 300,
  /** an utterance is cut off here */
  MAX_UTTERANCE_MS: 60_000,
  /** energy fallback: room noise is measured over the first CALIBRATE_MS ... */
  CALIBRATE_MS: 500,
  /** ... and speech is RMS above max(floor x FLOOR_FACTOR, floor + FLOOR_MARGIN, MIN_THRESHOLD) */
  FLOOR_FACTOR: 3,
  FLOOR_MARGIN: 0.01,
  MIN_THRESHOLD: 0.012,
  /** energy fallback: end of speech after this much silence */
  ENERGY_SILENCE_MS: 1200,
  /** energy fallback: while nobody speaks the recording restarts this often so the clip stays small */
  IDLE_RESTART_MS: 20_000,
  TICK_MS: 50,
} as const;

export const VAD_ASSET_PATH = "/vad/";

export type Microphone = {
  /** Which detector is in use. */
  readonly detector: "silero" | "energy";
  /** Current level, 0 to 1, for a meter. */
  level(): number;
  /** While muted, speech is ignored. */
  muted: boolean;
  /**
   * Resolves with the audio of one utterance once it has ended (or null when `signal` aborts).
   * `onSpeech` fires when speech starts; `onIdle` gets the ms spent waiting with no speech, every tick.
   */
  utterance(opts: { signal: AbortSignal; onSpeech?: () => void; onIdle?: (ms: number) => void }): Promise<Blob | null>;
  close(): void;
};

type Vad = {
  start(): Promise<void>;
  pause(): Promise<void>;
  destroy(): Promise<void>;
  setOptions(o: { submitUserSpeechOnPause?: boolean }): void;
};

/** Loads Silero VAD on our own stream and audio context. Throws if anything is missing. */
async function loadSilero(
  stream: MediaStream,
  ctx: AudioContext,
  handlers: { onSpeechStart: () => void; onSpeechEnd: (audio: Float32Array) => void; onMisfire: () => void },
): Promise<{ vad: Vad; encode: (a: Float32Array) => Blob }> {
  const mod = await import("@ricky0123/vad-web");
  const vad = await mod.MicVAD.new({
    model: "v5",
    baseAssetPath: VAD_ASSET_PATH,
    onnxWASMBasePath: VAD_ASSET_PATH,
    audioContext: ctx,
    getStream: async () => stream,
    pauseStream: async () => {}, // the stream is ours: keep it open between turns
    resumeStream: async () => stream,
    startOnLoad: false,
    positiveSpeechThreshold: LISTEN.VAD_POSITIVE,
    negativeSpeechThreshold: LISTEN.VAD_NEGATIVE,
    redemptionMs: LISTEN.SILENCE_MS,
    minSpeechMs: LISTEN.MIN_SPEECH_MS,
    preSpeechPadMs: LISTEN.PRE_SPEECH_PAD_MS,
    submitUserSpeechOnPause: false,
    ortConfig: (ort) => {
      ort.env.logLevel = "error";
      ort.env.wasm.numThreads = 1; // no cross-origin isolation here; one thread is plenty for VAD
    },
    onSpeechStart: handlers.onSpeechStart,
    onSpeechEnd: handlers.onSpeechEnd,
    onVADMisfire: handlers.onMisfire,
  });
  return { vad, encode: (a) => new Blob([mod.utils.encodeWAV(a)], { type: "audio/wav" }) };
}

/**
 * Opens the microphone for hands-free use (echo cancellation, noise suppression and auto gain on) and loads
 * Silero VAD; if that fails, calibrates the energy detector over the first half second of room noise.
 */
export async function openMicrophone(): Promise<Microphone> {
  if (typeof window === "undefined" || !window.isSecureContext || !navigator.mediaDevices?.getUserMedia)
    throw new VoiceFailure("insecure", "The microphone needs a secure connection: open the panel over HTTPS or 127.0.0.1.");
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (e) {
    throw micFailure(e);
  }
  const ctx = new AudioContext();
  if (ctx.state === "suspended") await ctx.resume().catch(() => {});
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 1024;
  const samples = new Float32Array(analyser.fftSize);
  ctx.createMediaStreamSource(stream).connect(analyser);
  const rms = () => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (const v of samples) sum += v * v;
    return Math.sqrt(sum / samples.length);
  };
  let closed = false;
  const level = () => (closed ? 0 : Math.min(1, Math.sqrt(rms()) * 1.6));
  const shutdown = () => {
    closed = true;
    stream.getTracks().forEach((t) => t.stop());
    void ctx.close().catch(() => {});
  };

  // the current utterance's callbacks; Silero calls these
  let turn: { onStart: () => void; onEnd: (a: Float32Array) => void; onMisfire: () => void } | null = null;
  const silero = await loadSilero(stream, ctx, {
    onSpeechStart: () => turn?.onStart(),
    onSpeechEnd: (a) => turn?.onEnd(a),
    onMisfire: () => turn?.onMisfire(),
  }).catch((e: unknown) => {
    console.warn("[voice] Silero VAD unavailable, using the energy detector:", e instanceof Error ? e.message : e);
    return null;
  });

  if (silero) {
    const { vad, encode } = silero;
    const mic: Microphone = {
      detector: "silero",
      muted: false,
      level,
      utterance({ signal, onSpeech, onIdle }) {
        return new Promise<Blob | null>((resolve) => {
          const idleStart = performance.now();
          let speaking = false;
          let maxTimer: ReturnType<typeof setTimeout> | undefined;
          const idleTimer = setInterval(() => {
            if (!speaking) onIdle?.(performance.now() - idleStart);
          }, 250);
          const done = (blob: Blob | null) => {
            clearInterval(idleTimer);
            clearTimeout(maxTimer);
            signal.removeEventListener("abort", onAbort);
            turn = null;
            void vad.pause().catch(() => {});
            vad.setOptions({ submitUserSpeechOnPause: false });
            resolve(blob);
          };
          const onAbort = () => done(null);
          signal.addEventListener("abort", onAbort);
          turn = {
            onStart: () => {
              if (mic.muted) return;
              speaking = true;
              onSpeech?.();
              maxTimer = setTimeout(() => {
                vad.setOptions({ submitUserSpeechOnPause: true }); // cut off: pausing hands over the audio so far
                void vad.pause();
              }, LISTEN.MAX_UTTERANCE_MS);
            },
            onEnd: (audio) => {
              if (mic.muted || !speaking) return;
              done(encode(audio));
            },
            onMisfire: () => {
              speaking = false;
              clearTimeout(maxTimer);
            },
          };
          void vad.start();
        });
      },
      close() {
        turn = null;
        void vad.destroy().catch(() => {});
        shutdown();
      },
    };
    return mic;
  }

  // energy fallback: calibrate on room noise
  if (typeof MediaRecorder === "undefined") {
    shutdown();
    throw new VoiceFailure("unsupported", "This browser cannot record audio.");
  }
  const mimeType = PREFERRED_TYPES.find((t) => MediaRecorder.isTypeSupported?.(t));
  const readings: number[] = [];
  const t0 = performance.now();
  while (performance.now() - t0 < LISTEN.CALIBRATE_MS) {
    readings.push(rms());
    await new Promise((r) => setTimeout(r, LISTEN.TICK_MS));
  }
  const floor = readings.length ? readings.reduce((a, b) => a + b, 0) / readings.length : 0;
  const threshold = Math.max(floor * LISTEN.FLOOR_FACTOR, floor + LISTEN.FLOOR_MARGIN, LISTEN.MIN_THRESHOLD);

  const mic: Microphone = {
    detector: "energy",
    muted: false,
    level,
    utterance({ signal, onSpeech, onIdle }) {
      return new Promise<Blob | null>((resolve, reject) => {
        let recorder: MediaRecorder;
        let chunks: Blob[] = [];
        const begin = () => {
          chunks = [];
          recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
          recorder.ondataavailable = (e) => {
            if (e.data.size) chunks.push(e.data);
          };
          recorder.start(250);
        };
        try {
          begin();
        } catch {
          reject(new VoiceFailure("unsupported", "This browser cannot record audio."));
          return;
        }
        let segmentStart = performance.now();
        const idleStart = performance.now();
        let speechStart = 0;
        let speechMs = 0;
        let lastLoud = 0;
        const finish = (keep: boolean) => {
          clearInterval(timer);
          signal.removeEventListener("abort", onAbort);
          if (!keep) {
            recorder.onstop = null;
            if (recorder.state !== "inactive") recorder.stop();
            resolve(null);
            return;
          }
          recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || mimeType || "audio/webm" }));
          recorder.stop();
        };
        const onAbort = () => finish(false);
        signal.addEventListener("abort", onAbort);
        const timer = setInterval(() => {
          if (closed) return finish(false);
          const now = performance.now();
          const loud = !mic.muted && rms() > threshold;
          if (loud) {
            if (!speechStart) {
              speechStart = now;
              onSpeech?.();
            }
            speechMs += LISTEN.TICK_MS;
            lastLoud = now;
          }
          if (speechStart) {
            if (now - speechStart > LISTEN.MAX_UTTERANCE_MS) return finish(true);
            if (now - lastLoud > LISTEN.ENERGY_SILENCE_MS) {
              if (speechMs >= LISTEN.MIN_SPEECH_MS) return finish(true);
              speechStart = 0; // too short: keep listening
              speechMs = 0;
            }
            return;
          }
          onIdle?.(now - idleStart);
          if (now - segmentStart > LISTEN.IDLE_RESTART_MS) {
            recorder.onstop = null;
            recorder.stop();
            begin();
            segmentStart = now;
          }
        }, LISTEN.TICK_MS);
      });
    },
    close: shutdown,
  };
  return mic;
}

/* ------------------------------------------------------------------ speaking */

export type SpeechPhase = "loading" | "playing" | "paused";
export type SpeechState = {
  /** What is being read (e.g. a comment id), or null. Only one thing plays at a time. */
  id: string | null;
  phase: SpeechPhase | null;
  /** The last read-aloud failure, for the item that failed. */
  error: { id: string; message: string } | null;
};

let state: SpeechState = { id: null, phase: null, error: null };
const listeners = new Set<() => void>();
const setState = (patch: Partial<SpeechState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

/** For useSyncExternalStore. */
export const subscribeSpeech = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
export const speechState = () => state;

type Session = { stop(): void; done: Promise<void> };
let current: Session | null = null;

/** Stops whatever is being read aloud. */
export function stopSpeaking() {
  const s = current;
  current = null;
  s?.stop();
  if (state.id !== null) setState({ id: null, phase: null });
}

/** Clears a shown read-aloud error. */
export const clearSpeechError = () => state.error && setState({ error: null });

/**
 * Reads Markdown aloud, paragraph by paragraph: the first chunk starts playing while the next is fetched.
 * Stops anything already playing first. While the page is hidden playback pauses (nothing queues up) and
 * resumes when it is visible again. Resolves when finished or stopped; rejects with a VoiceFailure.
 */
export function speak(markdown: string, { id = "speech", engine = "service" }: { id?: string; engine?: VoiceEngine } = {}): Promise<void> {
  stopSpeaking();
  setState({ id, phase: "loading", error: null });
  let session: Session | null = null;
  const onPhase = (phase: SpeechPhase) => {
    if (session && current === session) setState({ phase });
  };
  try {
    session = engine === "browser" ? browserSession(markdown, onPhase) : serviceSession(markdown, onPhase);
  } catch (e) {
    setState({ id: null, phase: null, error: { id, message: friendly(e, "Read-aloud is not available.") } });
    return Promise.reject(e);
  }
  const self = session;
  current = self;
  return self.done.then(
    () => {
      if (current === self) {
        current = null;
        setState({ id: null, phase: null });
      }
    },
    (e) => {
      if (current !== self) return; // stopped or replaced: not an error
      current = null;
      setState({ id: null, phase: null, error: { id, message: friendly(e, "This reply could not be read aloud.") } });
      throw e;
    },
  );
}

function serviceSession(markdown: string, onPhase: (p: SpeechPhase) => void): Session {
  const chunks = splitForSpeech(markdown);
  const ctrl = new AbortController();
  const fetches = new Map<number, Promise<Blob | null>>();
  const urls: string[] = [];
  let stopped = false;
  let audio: HTMLAudioElement | null = null;
  let pausedByHide = false;
  let endPlayback: (() => void) | null = null;
  let wake: (() => void) | null = null;

  const get = (i: number) => {
    let p = fetches.get(i);
    if (!p) {
      p = synthesize(chunks[i], ctrl.signal);
      p.catch(() => {}); // awaited later; avoid an unhandled rejection while prefetching
      fetches.set(i, p);
    }
    return p;
  };

  const onVisibility = () => {
    if (document.hidden) {
      if (audio && !audio.paused) {
        audio.pause();
        pausedByHide = true;
        onPhase("paused");
      }
    } else {
      if (pausedByHide && audio) {
        pausedByHide = false;
        void audio.play().catch(() => {});
        onPhase("playing");
      }
      wake?.();
    }
  };

  const play = (blob: Blob) =>
    new Promise<void>((resolve, reject) => {
      const url = URL.createObjectURL(blob);
      urls.push(url);
      const a = new Audio(url);
      audio = a;
      endPlayback = resolve;
      a.onended = () => resolve();
      a.onerror = () => reject(new VoiceFailure("playback", "This audio could not be played."));
      a.play().then(
        () => onPhase("playing"),
        (e: unknown) =>
          reject(
            e instanceof DOMException && e.name === "NotAllowedError"
              ? new VoiceFailure("autoplay", "The browser blocked playback. Press the speaker to listen.")
              : new VoiceFailure("playback", "This audio could not be played."),
          ),
      );
    });

  const done = (async () => {
    document.addEventListener("visibilitychange", onVisibility);
    try {
      for (let i = 0; i < chunks.length; i++) {
        const blob = await get(i);
        if (stopped) return;
        if (i + 1 < chunks.length) get(i + 1); // fetch the next paragraph while this one plays
        if (!blob) continue;
        if (document.hidden) {
          onPhase("paused");
          await new Promise<void>((r) => (wake = r));
          wake = null;
          if (stopped) return;
        }
        await play(blob);
        audio = null;
        if (stopped) return;
      }
    } catch (e) {
      if (stopped) return;
      throw e;
    } finally {
      document.removeEventListener("visibilitychange", onVisibility);
      urls.forEach((u) => URL.revokeObjectURL(u));
    }
  })();

  return {
    done,
    stop() {
      stopped = true;
      ctrl.abort();
      audio?.pause();
      endPlayback?.();
      wake?.();
    },
  };
}

function browserSession(markdown: string, onPhase: (p: SpeechPhase) => void): Session {
  const synth = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!synth || typeof SpeechSynthesisUtterance === "undefined")
    throw new VoiceFailure("unsupported", "This browser cannot read aloud.");
  const parts = splitForSpeech(markdown).map(markdownToSpeech).filter(Boolean);
  let stopped = false;
  let finish: () => void = () => {};
  synth.cancel();

  const onVisibility = () => {
    if (document.hidden) {
      synth.pause();
      onPhase("paused");
    } else {
      synth.resume();
      onPhase("playing");
    }
  };
  document.addEventListener("visibilitychange", onVisibility);

  const done = new Promise<void>((resolve, reject) => {
    finish = resolve;
    let i = 0;
    const next = () => {
      if (stopped || i >= parts.length) return resolve();
      const u = new SpeechSynthesisUtterance(parts[i++]);
      u.lang = "en-US";
      u.onstart = () => onPhase(document.hidden ? "paused" : "playing");
      u.onend = next;
      u.onerror = (e) => {
        if (stopped || e.error === "interrupted" || e.error === "canceled") return resolve();
        reject(new VoiceFailure("playback", "This browser could not read the reply aloud."));
      };
      synth.speak(u);
      if (document.hidden) synth.pause();
    };
    next();
  }).finally(() => document.removeEventListener("visibilitychange", onVisibility));

  return {
    done,
    stop() {
      stopped = true;
      synth.cancel();
      finish();
    },
  };
}

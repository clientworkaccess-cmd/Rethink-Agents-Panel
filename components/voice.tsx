"use client";
// Voice UI: whether voice is on (from the server's VOICE_URL), dictation in the composer, read-aloud on agent
// replies and the "Read new replies aloud" setting. The browser primitives live in lib/voice-client.ts.
import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { VoiceMode } from "@/lib/voice";
import {
  VoiceFailure,
  clearSpeechError,
  speak,
  speechState,
  startRecording,
  stopSpeaking,
  subscribeSpeech,
  transcribe,
  voiceMessage,
  type Recording,
  type SpeechState,
  type VoiceEngine,
  VOICE_KEY,
  replyVoice,
  type ReplyVoice,
} from "@/lib/voice-client";
import { Button, Icon, IconButton, Mono, cx } from "./ui";

/* ------------------------------------------------------------------ mode */

type VoiceConfig = { mode: VoiceMode; engine: VoiceEngine };
const VoiceContext = createContext<VoiceConfig>({ mode: "off", engine: "service" });

export function VoiceProvider({ mode, children }: { mode: VoiceMode; children: React.ReactNode }) {
  return <VoiceContext.Provider value={{ mode, engine: mode === "mock" ? "browser" : "service" }}>{children}</VoiceContext.Provider>;
}

/** Voice mode for this panel: "off" hides every voice control. */
export const useVoice = () => useContext(VoiceContext);

/* ------------------------------------------------------------------ settings */

const AUTO_KEY = "panel-voice-autoread";
const autoListeners = new Set<() => void>();
const readAuto = () => {
  try {
    return localStorage.getItem(AUTO_KEY) === "on";
  } catch {
    return false;
  }
};

/** "Read new replies aloud" (per browser, off by default). */
export function useAutoRead(): [boolean, (on: boolean) => void] {
  const on = useSyncExternalStore(
    (fn) => {
      autoListeners.add(fn);
      return () => autoListeners.delete(fn);
    },
    readAuto,
    () => false,
  );
  const set = useCallback((next: boolean) => {
    try {
      localStorage.setItem(AUTO_KEY, next ? "on" : "off");
    } catch {
      // storage blocked
    }
    autoListeners.forEach((l) => l());
    if (!next) stopSpeaking();
  }, []);
  return [on, set];
}

export function AutoReadToggle() {
  const { mode } = useVoice();
  const [on, setOn] = useAutoRead();
  if (mode === "off") return null;
  return (
    <Button
      variant={on ? "secondary" : "ghost"}
      size="sm"
      aria-pressed={on}
      title={on ? "Read new replies aloud: on" : "Read new replies aloud: off"}
      onClick={() => setOn(!on)}
    >
      <Icon name={on ? "soundOn" : "soundOff"} />
      <span className="hidden lg:inline">Read new replies aloud</span>
    </Button>
  );
}

const voiceListeners = new Set<() => void>();

/** The reply voice (per browser): female by default, or male. */
export function useReplyVoice(): [ReplyVoice, (v: ReplyVoice) => void] {
  const v = useSyncExternalStore(
    (fn) => {
      voiceListeners.add(fn);
      return () => voiceListeners.delete(fn);
    },
    replyVoice,
    () => "female" as ReplyVoice,
  );
  const set = useCallback((next: ReplyVoice) => {
    try {
      localStorage.setItem(VOICE_KEY, next);
    } catch {
      // storage blocked
    }
    voiceListeners.forEach((l) => l());
  }, []);
  return [v, set];
}

/** Switches the reply voice; shown next to "Read new replies aloud". Hidden in mock mode (the browser speaks there). */
export function ReplyVoiceToggle() {
  const { mode } = useVoice();
  const [v, setV] = useReplyVoice();
  if (mode !== "service") return null;
  const next: ReplyVoice = v === "female" ? "male" : "female";
  return (
    <Button
      variant="ghost"
      size="sm"
      title={`Reply voice: ${v}. Click for the ${next} voice.`}
      onClick={() => {
        setV(next);
        stopSpeaking();
      }}
    >
      <span className="text-xs">Voice: {v === "female" ? "Female" : "Male"}</span>
    </Button>
  );
}

/* ------------------------------------------------------------------ read-aloud */

export const useSpeech = (): SpeechState => useSyncExternalStore(subscribeSpeech, speechState, speechState);

/** Speaker button on an agent reply: plays it, turns into Stop; only one reply plays at a time. */
export function SpeakButton({ id, text }: { id: string; text: string }) {
  const { mode, engine } = useVoice();
  const s = useSpeech();
  if (mode === "off") return null;
  const active = s.id === id;
  return (
    <span className="inline-flex items-center gap-1">
      <IconButton
        label={active ? "Stop reading" : "Read aloud"}
        aria-pressed={active}
        onClick={() => (active ? stopSpeaking() : void speak(text, { id, engine }).catch(() => {}))}
      >
        <Icon name={active ? "stop" : "soundOn"} className="size-icon-sm" />
      </IconButton>
      {active && <span className="text-xs">{s.phase === "loading" ? "Preparing…" : s.phase === "paused" ? "Paused" : "Reading"}</span>}
    </span>
  );
}

/** The read-aloud error for one reply, shown under it. */
export function SpeechError({ id }: { id: string }) {
  const s = useSpeech();
  if (s.error?.id !== id) return null;
  return (
    <p role="alert" className="flex items-center gap-2 text-xs text-destructive">
      {s.error.message}
      <button type="button" className="underline" onClick={clearSpeechError}>
        Dismiss
      </button>
    </p>
  );
}

/* ------------------------------------------------------------------ dictation */

export const DICTATION_MAX_MS = 180_000;

export type Dictation = {
  phase: "idle" | "starting" | "recording" | "transcribing";
  elapsed: number;
  level: number;
  error: string | null;
  toggle: () => void;
  cancel: () => void;
  dismissError: () => void;
};

/**
 * Click to record, click again to transcribe. Esc cancels; recording auto-stops at 3 minutes. The transcript
 * goes to `onText` (inserted into the draft by the caller; never sent automatically).
 */
export function useDictation(onText: (text: string) => void): Dictation {
  const [phase, setPhase] = useState<Dictation["phase"]>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<Recording | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => {
    onTextRef.current = onText;
  });

  const finish = useCallback(async () => {
    const r = rec.current;
    if (!r) return;
    rec.current = null;
    const ms = r.elapsed();
    setPhase("transcribing");
    try {
      const blob = await r.stop();
      if (ms < 500 || blob.size < 1000) throw new VoiceFailure("short", "That was too short to hear anything. Hold on a little longer.");
      const text = await transcribe(blob);
      if (!text) throw new VoiceFailure("empty", "No speech was heard. Try again a little closer to the microphone.");
      onTextRef.current(text);
    } catch (e) {
      setError(voiceMessage(e));
    } finally {
      setPhase("idle");
      setElapsed(0);
      setLevel(0);
    }
  }, []);

  const cancel = useCallback(() => {
    rec.current?.cancel();
    rec.current = null;
    setPhase("idle");
    setElapsed(0);
    setLevel(0);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    stopSpeaking(); // do not record the read-aloud voice
    setPhase("starting");
    try {
      rec.current = await startRecording({ maxMs: DICTATION_MAX_MS, onAutoStop: () => void finish() });
      setPhase("recording");
    } catch (e) {
      setError(voiceMessage(e));
      setPhase("idle");
    }
  }, [finish]);

  // timer and level meter
  useEffect(() => {
    if (phase !== "recording") return;
    let raf = 0;
    const tick = () => {
      const r = rec.current;
      if (r) {
        setElapsed(r.elapsed());
        setLevel(r.level());
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        cancel();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("keydown", onKey);
    };
  }, [phase, cancel]);

  // leaving the chat drops a recording in progress
  useEffect(() => () => rec.current?.cancel(), []);

  const toggle = useCallback(() => {
    if (phase === "recording") void finish();
    else if (phase === "idle") void start();
  }, [phase, finish, start]);

  return { phase, elapsed, level, error, toggle, cancel, dismissError: () => setError(null) };
}

const clock = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Small live level meter: five bars that follow the input level. */
export function LevelMeter({ level, className }: { level: number; className?: string }) {
  return (
    <span className={cx("inline-flex h-icon items-center gap-0.5", className)} aria-hidden>
      {[0.55, 0.8, 1, 0.8, 0.55].map((w, i) => (
        <span
          key={i}
          className="h-full w-0.5 origin-center rounded-full bg-foreground transition-transform duration-(--motion-duration-fast)"
          style={{ transform: `scaleY(${Math.max(0.15, Math.min(1, level * w * 1.4))})` }}
        />
      ))}
    </span>
  );
}

/** Mic button for the composer: start, stop (while recording), disabled while transcribing. */
export function MicButton({ dictation, disabled }: { dictation: Dictation; disabled?: boolean }) {
  const { mode } = useVoice();
  if (mode === "off") return null;
  const recording = dictation.phase === "recording";
  return (
    <IconButton
      label={recording ? "Stop and transcribe" : "Dictate a message"}
      variant={recording ? "destructive" : "ghost"}
      size="icon-sm"
      aria-pressed={recording}
      disabled={disabled || dictation.phase === "starting" || dictation.phase === "transcribing"}
      onClick={dictation.toggle}
    >
      <Icon name={recording ? "stop" : "mic"} />
    </IconButton>
  );
}

/** The strip above the composer text while recording or transcribing. */
export function DictationStrip({ dictation }: { dictation: Dictation }) {
  if (dictation.phase === "recording")
    return (
      <div className="flex items-center gap-2 px-2 pt-1 text-xs" role="status">
        <span className="rec-dot size-dot rounded-full bg-destructive" aria-hidden />
        <Mono className="text-foreground">{clock(dictation.elapsed)}</Mono>
        <LevelMeter level={dictation.level} />
        <span>Recording · click stop when done · Esc to cancel</span>
        {dictation.elapsed > DICTATION_MAX_MS - 30_000 && <span>· stops at {clock(DICTATION_MAX_MS)}</span>}
      </div>
    );
  if (dictation.phase === "transcribing" || dictation.phase === "starting")
    return (
      <div className="px-2 pt-1 text-xs" role="status">
        <span className="shimmer">{dictation.phase === "starting" ? "Starting the microphone…" : "Transcribing…"}</span>
      </div>
    );
  return null;
}

"use client";
// Hands-free Talk mode: a full-screen voice overlay over the open chat session. Half-duplex loop:
// listen (silence detection) -> transcribe -> 1.5 s to cancel -> send as a normal chat message -> wait for the
// reply (thinking character, quiet chime, latest run progress) -> read it aloud -> listen again.
// Every turn is an ordinary chat message, so the text history stays in the chat.
import { useCallback, useEffect, useRef, useState } from "react";
import { sounds } from "@/lib/sound";
import { markdownToSpeech } from "@/lib/speech-text";
import { acknowledgement, createNarrator } from "@/lib/voice-narration";
import type { Agent, Comment } from "@/lib/types";
import { openMicrophone, speak, stopSpeaking, transcribe, voiceMessage, type Microphone, type VoiceEngine } from "@/lib/voice-client";
import Critter, { type CritterMood } from "../character/Critter";
import { Button, Icon, IconButton, SectionLabel } from "../ui";
import { LevelMeter, useVoice } from "../voice";

const CONFIRM_MS = 1500;
const IDLE_END_MS = 120_000;
const TICK_EVERY_MS = 1800;
const STOP_PHRASES = new Set(["stop listening", "end voice mode"]);

/** True when the whole utterance is "stop listening" or "end voice mode" (it is then never sent). */
export function isStopPhrase(text: string): boolean {
  return STOP_PHRASES.has(text.toLowerCase().replace(/[^a-z ]+/g, " ").replace(/\s+/g, " ").trim());
}

type Phase = "starting" | "listening" | "hearing" | "transcribing" | "confirm" | "waiting" | "speaking" | "ending";

const LABEL: Record<Phase, string> = {
  starting: "Starting the microphone",
  listening: "Listening",
  hearing: "Hearing you",
  transcribing: "Transcribing",
  confirm: "Sending",
  waiting: "Working on it",
  speaking: "Speaking",
  ending: "Ending voice mode",
};

const MOOD: Record<Phase, CritterMood> = {
  starting: "idle",
  listening: "idle",
  hearing: "happy",
  transcribing: "busy",
  confirm: "happy",
  waiting: "busy",
  speaking: "wave",
  ending: "idle",
};

type Props = {
  agent: Agent;
  /** The session's comments; agent replies have authorAgentId. */
  comments: Comment[];
  /** True while a reply is pending (message sent, run going). */
  waiting: boolean;
  progressLine: string | null;
  replyTimeoutMs: number;
  onSend: (text: string) => void;
  /** `message`: why it ended on an error, shown in the normal chat. */
  onClose: (message?: string) => void;
};

const sleep = (ms: number, signal: AbortSignal) =>
  new Promise<void>((r) => {
    const t = setTimeout(r, ms);
    signal.addEventListener("abort", () => {
      clearTimeout(t);
      r();
    });
  });

export default function TalkMode(props: Props) {
  const { agent } = props;
  const { engine } = useVoice();
  const [phase, setPhase] = useState<Phase>("starting");
  const [caption, setCaption] = useState<{ who: "you" | "agent" | "status"; text: string } | null>(null);
  const [micMuted, setMicMuted] = useState(false);
  const [quiet, setQuiet] = useState(false);
  const [level, setLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const live = useRef(props);
  useEffect(() => {
    live.current = props;
  });
  const quietRef = useRef(quiet);
  useEffect(() => {
    quietRef.current = quiet;
  }, [quiet]);
  const mic = useRef<Microphone | null>(null);
  const stopAll = useRef(new AbortController());
  const turn = useRef<AbortController | null>(null);
  const cancelSend = useRef<(() => void) | null>(null);
  const ending = useRef(false);

  /** Speak a status line; falls back to the browser's voice if the service cannot. Never throws. */
  const say = useCallback(
    async (text: string, eng: VoiceEngine = engine) => {
      try {
        await speak(text, { id: "talk-status", engine: eng });
      } catch {
        if (eng !== "browser") await speak(text, { id: "talk-status", engine: "browser" }).catch(() => {});
      }
    },
    [engine],
  );

  const end = useCallback(
    async (opts: { silent?: boolean; message?: string } = {}) => {
      if (ending.current) return;
      ending.current = true;
      turn.current?.abort();
      stopSpeaking();
      setPhase("ending");
      if (opts.message) setError(opts.message);
      setCaption({ who: "status", text: opts.message ?? "Ending voice mode" });
      if (!opts.silent) await say(opts.message ? `${opts.message} Ending voice mode.` : "Ending voice mode");
      stopAll.current.abort();
      mic.current?.close();
      mic.current = null;
      live.current.onClose(opts.message);
    },
    [say],
  );

  // the loop
  useEffect(() => {
    const signal = stopAll.current.signal;
    const stopped = () => signal.aborted || ending.current;
    const replyIds = () => new Set(live.current.comments.filter((c) => c.authorAgentId).map((c) => c.id));

    /**
     * Waits for a new agent reply. Meanwhile: the acknowledgement (if any) is spoken at once, then short
     * spoken progress from the run events (lib/voice-narration.ts), a quiet chime when nothing is said,
     * and the "still working" line once the reply timeout passes. Narration stops when the reply arrives.
     */
    const waitForReply = async (baseline: Set<string>, sentAt: number, ack: string | null) => {
      setPhase("waiting");
      let talking: Promise<void> | null = null;
      const talk = (text: string) => {
        setCaption({ who: "status", text });
        const p = say(text).finally(() => {
          if (talking === p) talking = null;
        });
        talking = p;
      };
      if (ack) talk(ack);
      const narrator = createNarrator(Date.now());
      let saidTimeout = false;
      let lastTick = 0;
      while (!stopped()) {
        const fresh = live.current.comments.filter((c) => c.authorAgentId && !baseline.has(c.id));
        if (fresh.length) {
          if (talking) stopSpeaking();
          return fresh.at(-1)!;
        }
        const now = Date.now();
        const line = live.current.progressLine;
        if (!talking) {
          if (!saidTimeout && now - sentAt > live.current.replyTimeoutMs) {
            saidTimeout = true;
            talk("Still working on it, I'll read it out when it's ready.");
          } else {
            const phrase = narrator.next(now, line);
            if (phrase) talk(phrase);
            else if (!quietRef.current && now - lastTick > TICK_EVERY_MS) {
              sounds.tick();
              lastTick = now;
            }
          }
        } else narrator.next(now, line); // still note new events while talking
        await sleep(250, signal);
      }
      if (talking) stopSpeaking();
      return null;
    };

    const speakReply = async (reply: Comment) => {
      setPhase("speaking");
      setCaption({ who: "agent", text: markdownToSpeech(reply.body) });
      try {
        await speak(reply.body, { id: `talk-${reply.id}`, engine });
      } catch (e) {
        if (!stopped()) await end({ message: voiceMessage(e) });
      }
    };

    (async () => {
      try {
        mic.current = await openMicrophone();
      } catch (e) {
        await end({ message: voiceMessage(e) });
        return;
      }
      if (signal.aborted) {
        mic.current?.close();
        return;
      }
      // reopened while a reply is pending (e.g. the first message created the session): wait for it
      if (live.current.waiting) {
        const reply = await waitForReply(replyIds(), Date.now(), null);
        if (reply) await speakReply(reply);
      }
      while (!stopped()) {
        const m = mic.current;
        if (!m) return;
        turn.current = new AbortController();
        setPhase("listening");
        const blob = await m.utterance({
          signal: turn.current.signal,
          onSpeech: () => setPhase("hearing"),
          onIdle: (ms) => {
            if (ms > IDLE_END_MS && !m.muted) void end();
          },
        });
        if (stopped()) return;
        if (!blob) continue; // restarted (unmuted) or interrupted
        setPhase("transcribing");
        let text: string;
        try {
          text = await transcribe(blob, signal);
        } catch (e) {
          if (!stopped()) await end({ message: voiceMessage(e) });
          return;
        }
        if (stopped()) return;
        if (!text) continue;
        if (isStopPhrase(text)) {
          await end();
          return;
        }
        setCaption({ who: "you", text });
        setPhase("confirm");
        const cancelled = await new Promise<boolean>((resolve) => {
          const t = setTimeout(() => resolve(false), CONFIRM_MS);
          cancelSend.current = () => {
            clearTimeout(t);
            resolve(true);
          };
          signal.addEventListener("abort", () => {
            clearTimeout(t);
            resolve(true);
          });
        });
        cancelSend.current = null;
        if (stopped()) return;
        if (cancelled) {
          setCaption({ who: "status", text: "Cancelled. Go ahead." });
          continue;
        }
        const baseline = replyIds();
        live.current.onSend(text);
        const reply = await waitForReply(baseline, Date.now(), acknowledgement(text));
        if (!reply) return;
        await speakReply(reply);
      }
    })();

    const stop = stopAll.current;
    return () => {
      // unmount (e.g. the session was just created and the chat re-mounted): stop quietly
      stop.abort();
      turn.current?.abort();
      stopSpeaking();
      mic.current?.close();
      mic.current = null;
    };
    // the loop runs once per mount; it reads live props through `live`
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // exits: Esc ends; a hidden tab ends at once
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        void end();
      }
    };
    const onHide = () => {
      if (document.hidden) void end({ silent: true });
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("visibilitychange", onHide);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("visibilitychange", onHide);
    };
  }, [end]);

  // level meter while listening
  useEffect(() => {
    if (phase !== "listening" && phase !== "hearing") return;
    let raf = 0;
    const tick = () => {
      setLevel(mic.current?.level() ?? 0);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      setLevel(0);
    };
  }, [phase]);

  const interrupt = () => {
    if (phase === "speaking") stopSpeaking(); // the loop goes back to listening
  };

  const toggleMic = () => {
    const next = !micMuted;
    setMicMuted(next);
    if (mic.current) mic.current.muted = next;
    if (!next) turn.current?.abort(); // fresh turn, fresh idle timer
  };

  const listening = phase === "listening" || phase === "hearing";

  return (
    <div role="dialog" aria-modal="true" aria-label={`Voice mode with ${agent.name}`} className="fade-in fixed inset-0 z-50 flex flex-col bg-background">
      <div className="flex items-center justify-between gap-2 px-4 py-3">
        <SectionLabel>Voice mode · {agent.name}</SectionLabel>
        <span className="text-xs">Esc to end</span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-6 px-6 text-center">
        <button
          type="button"
          onClick={interrupt}
          className="rounded-full"
          aria-label={phase === "speaking" ? "Interrupt" : agent.name}
          disabled={phase !== "speaking"}
        >
          <Critter agent={agent} size={160} mood={MOOD[phase]} />
        </button>
        <div className="flex flex-col items-center gap-2" aria-live="polite">
          <p className="flex items-center gap-2 text-sm text-foreground">
            {listening && <LevelMeter level={micMuted ? 0 : level} />}
            <span className={phase === "waiting" || phase === "transcribing" ? "shimmer" : undefined}>
              {micMuted && listening ? "Microphone muted" : phase === "waiting" ? `${agent.name} is working on it` : LABEL[phase]}
            </span>
          </p>
          {caption && (
            <p className={caption.who === "status" ? "max-w-prose text-sm" : "max-w-prose text-xl text-foreground"}>
              {caption.who === "you" && <span className="text-muted-foreground">You: </span>}
              {caption.text}
            </p>
          )}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {phase === "confirm" && (
            <Button size="sm" onClick={() => cancelSend.current?.()}>
              <Icon name="close" className="size-icon-sm" />
              Cancel
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 px-4 pb-8 pt-4">
        <IconButton label={micMuted ? "Unmute microphone" : "Mute microphone"} size="control" variant="secondary" aria-pressed={micMuted} onClick={toggleMic}>
          <Icon name={micMuted ? "micOff" : "mic"} />
        </IconButton>
        <IconButton label={quiet ? "Turn the waiting chime on" : "Mute the waiting chime"} size="control" variant="secondary" aria-pressed={quiet} onClick={() => setQuiet((q) => !q)}>
          <Icon name={quiet ? "soundOff" : "soundOn"} />
        </IconButton>
        <Button size="control" onClick={interrupt} disabled={phase !== "speaking"}>
          <Icon name="stop" />
          Interrupt
        </Button>
        <Button variant="destructive" size="control" onClick={() => void end()} disabled={phase === "ending"}>
          End
        </Button>
      </div>
    </div>
  );
}

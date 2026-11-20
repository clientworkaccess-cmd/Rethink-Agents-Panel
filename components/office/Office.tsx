"use client";
// Office tab: polls agents + live runs every 4 s and hands them to the lazily loaded Pixi scene.
// Overlays: the clicked agent's bubble (Chat / See tasks), an activity ticker, reset view and sound toggles.
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { ACTIVITY_COLOR, ACTIVITY_LABEL, activityOf, roleLabel, runFor } from "@/lib/agents";
import { api, isUnreachable, timeAgo, usePoll } from "@/lib/client";
import { setSoundEnabled, soundEnabled, sounds } from "@/lib/sound";
import type { Activity, ActivityEvent, AgentsPayload } from "@/lib/types";
import { Loading, StatusDot, Unreachable } from "../ui";
import type { OfficeApi } from "./OfficeScene";

// PixiJS lives in its own chunk and only loads when this tab opens.
const OfficeScene = dynamic(() => import("./OfficeScene"), {
  ssr: false,
  loading: () => <Loading label="Opening the office…" />,
});

const POLL_MS = 4000;
type Tick = ActivityEvent & { local?: boolean };

export default function Office() {
  const router = useRouter();
  const [data, setData] = useState<AgentsPayload | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [selected, setSelected] = useState<string | null>(null);
  const [sound, setSound] = useState(false);
  const [ticks, setTicks] = useState<Tick[]>([]);
  const [leaving, setLeaving] = useState(false);
  const sceneApi = useRef<OfficeApi>(null);
  const pop = useRef<HTMLDivElement>(null);
  const prev = useRef<Record<string, Activity>>({});
  const soundRef = useRef(false);

  useEffect(() => {
    const on = soundEnabled();
    soundRef.current = on;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- read once from localStorage after mount
    setSound(on);
  }, []);

  const load = useCallback(async () => {
    try {
      const d = await api<AgentsPayload>("/api/agents");
      setData(d);
      setUnreachable(false);
      // turn status changes seen while the office is open into ticker lines
      const fresh: Tick[] = [];
      for (const a of d.agents) {
        const act = activityOf(a, d.liveRuns);
        const before = prev.current[a.id];
        prev.current[a.id] = act;
        if (!before || before === act) continue;
        const task = runFor(a.id, d.liveRuns)?.issueTitle;
        const at = new Date().toISOString();
        const base = { id: `local-${a.id}-${Date.now()}`, at, agentId: a.id, local: true };
        if (act === "working") fresh.push({ ...base, kind: "started", text: `${a.name} started ${task ? `“${task}”` : "a task"}` });
        else if (before === "working" && act !== "error") fresh.push({ ...base, kind: "finished", text: `${a.name} finished a run` });
        else if (act === "error") fresh.push({ ...base, kind: "failed", text: `${a.name} ran into a problem` });
        else if (act === "pending") fresh.push({ ...base, kind: "other", text: `${a.name} is waiting for you` });
      }
      if (fresh.length) setTicks((t) => [...fresh.reverse(), ...t].slice(0, 12));
    } catch (e) {
      if (isUnreachable(e)) setUnreachable(true);
    }
  }, []);
  usePoll(load, POLL_MS);

  const loadActivity = useCallback(async () => {
    try {
      const { events } = await api<{ events: ActivityEvent[] | null }>("/api/activity");
      if (!events) return;
      setTicks((t) => {
        const local = t.filter((x) => x.local);
        const merged = [...local, ...events].sort((a, b) => String(b.at).localeCompare(String(a.at)));
        const seen = new Set<string>();
        return merged.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))).slice(0, 12);
      });
    } catch {
      // the ticker is optional
    }
  }, []);
  usePoll(loadActivity, 15_000);

  // keep the bubble glued above the selected character while it moves
  useEffect(() => {
    if (!selected) return;
    let raf = 0;
    const follow = () => {
      const p = sceneApi.current?.headPos(selected);
      const el = pop.current;
      if (el && p) {
        const parent = el.parentElement;
        const w = parent?.clientWidth ?? 9999;
        const x = Math.min(Math.max(p.x, 150), w - 150);
        el.style.transform = `translate(${x}px, ${Math.max(p.y, 230)}px) translate(-50%, -100%)`;
      }
      raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(raf);
  }, [selected]);

  const onSelect = useCallback((id: string | null) => setSelected(id), []);
  const onEvent = useCallback((kind: "click" | "done" | "type") => {
    if (!soundRef.current) return;
    if (kind === "click") sounds.pop();
    else if (kind === "done") sounds.done();
    else sounds.type();
  }, []);

  const toggleSound = () => {
    const on = !sound;
    setSound(on);
    soundRef.current = on;
    setSoundEnabled(on);
    if (on) sounds.pop();
  };

  const goChat = (id: string) => {
    sceneApi.current?.celebrate(id);
    if (soundRef.current) sounds.done();
    setLeaving(true);
    setTimeout(() => router.push(`/chat?agent=${encodeURIComponent(id)}`), 650);
  };

  if (!data) return unreachable ? <Unreachable onRetry={load} /> : <Loading label="Finding the team…" />;

  const visible = data.agents.filter((a) => a.status !== "terminated");
  const picked = selected ? data.agents.find((a) => a.id === selected) : null;
  const pickedAct = picked ? activityOf(picked, data.liveRuns) : null;
  const pickedTask = picked ? runFor(picked.id, data.liveRuns)?.issueTitle : null;
  const working = visible.filter((a) => activityOf(a, data.liveRuns) === "working").length;

  return (
    <div className={`relative h-full overflow-hidden bg-surface transition-opacity duration-300 ${leaving ? "opacity-0" : ""}`}>
      <OfficeScene agents={data.agents} liveRuns={data.liveRuns} onSelect={onSelect} onEvent={onEvent} apiRef={sceneApi} />

      <div className="pointer-events-none absolute left-4 top-4 sm:left-6">
        <p className="eyebrow">Live office</p>
        <h1 className="display text-[28px]">Office</h1>
        <p className="text-caption text-body">
          {working} working · {visible.length} agents
          {unreachable && " · Paperclip is not reachable, showing the last state"}
        </p>
      </div>

      <div className="absolute right-4 top-4 flex gap-2 sm:right-6">
        <button onClick={() => sceneApi.current?.resetView()} className="btn btn-outline bg-canvas" title="Fit the whole office">
          Reset view
        </button>
        <button
          onClick={toggleSound}
          aria-pressed={sound}
          className="btn btn-outline bg-canvas px-2"
          title={sound ? "Sound on" : "Sound off"}
          aria-label={sound ? "Turn sound off" : "Turn sound on"}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 9.5h3.5L12 6v12l-4.5-3.5H4z" />
            {sound ? <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" /> : <path d="m16 9.5 5 5M21 9.5l-5 5" />}
          </svg>
        </button>
      </div>

      {visible.length === 0 && (
        <p className="absolute inset-x-0 bottom-24 text-center text-caption text-body">No agents yet. New agents get a desk automatically.</p>
      )}

      {picked && pickedAct && (
        <div ref={pop} className="absolute left-0 top-0 z-20 w-72" style={{ transform: "translate(-9999px,0)" }}>
          <div className="pop-in relative rounded-sm border border-line bg-canvas p-4" role="dialog" aria-label={picked.name}>
            <button
              onClick={() => setSelected(null)}
              aria-label="Close"
              className="absolute right-2 top-2 rounded-sm p-1 text-muted transition-colors hover:text-ink"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                <path d="m4 4 8 8M12 4l-8 8" />
              </svg>
            </button>
            <p className="eyebrow">{roleLabel(picked) || "Agent"}</p>
            <p className="display text-[22px]">{picked.name}</p>
            <p className="mt-1 flex items-center gap-1.5 text-caption" style={{ color: ACTIVITY_COLOR[pickedAct] }}>
              <StatusDot activity={pickedAct} size={7} />
              {ACTIVITY_LABEL[pickedAct]}
            </p>
            <p className="mt-1 text-caption text-body">{pickedTask ? `Working on: ${pickedTask}` : "No task running right now."}</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => goChat(picked.id)} className="btn btn-primary flex-1 uppercase">
                Chat
              </button>
              <button
                onClick={() => router.push(`/dashboard?agent=${encodeURIComponent(picked.id)}`)}
                className="btn btn-outline flex-1"
              >
                See tasks
              </button>
            </div>
            <span className="absolute -bottom-[7px] left-1/2 h-3 w-3 -translate-x-1/2 rotate-45 border-b border-r border-line bg-canvas" />
          </div>
        </div>
      )}

      {ticks.length > 0 && (
        <div className="absolute bottom-4 left-4 w-[min(360px,calc(100%-32px))] rounded-sm border border-line bg-canvas/95 p-3 sm:left-6" aria-live="polite">
          <p className="eyebrow mb-1.5">Activity</p>
          <ul className="flex flex-col gap-1">
            {ticks.slice(0, 4).map((t) => (
              <li key={t.id} className="ticker-in flex items-baseline gap-2 text-[13px] leading-snug">
                <span className="min-w-0 flex-1 truncate text-ink">{t.text}</span>
                <span className="shrink-0 font-mono text-[10px] text-muted">{timeAgo(t.at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

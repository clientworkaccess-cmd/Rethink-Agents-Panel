"use client";
// Office tab: polls agents + live runs every 4 s and hands them to the lazily loaded Pixi scene.
// Overlays: the clicked agent's bubble (Chat / See tasks), an activity ticker, reset view and sound toggles.
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { activityOf, roleLabel, runFor } from "@/lib/agents";
import { api, isUnreachable, usePoll } from "@/lib/client";
import { setSoundEnabled, soundEnabled, sounds } from "@/lib/sound";
import type { Activity, ActivityEvent, AgentsPayload } from "@/lib/types";
import { ActivityList } from "../lists";
import { ActivityStatus, Button, Icon, IconButton, InlineNotice, Loading, PageHeader, SectionLabel, StatusDot, Unreachable, flyoutClass } from "../ui";
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
  /** Phone only: the activity card is one row until tapped. */
  const [feedOpen, setFeedOpen] = useState(false);
  const sceneApi = useRef<OfficeApi>(null);
  const pop = useRef<HTMLDivElement>(null);
  const prev = useRef<Record<string, Activity>>({});
  const soundRef = useRef(false);
  const waitCursor = useRef(0);

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

  const onSelect = useCallback((id: string | null) => {
    setSelected(id);
    // any tap in the room folds the phone activity card back to one row
    setFeedOpen(false);
  }, []);
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
  const waitingAgents = visible.filter((a) => activityOf(a, data.liveRuns) === "pending");
  const waiting = waitingAgents.length;
  // each click pans to the next waiting agent's desk
  const waitingTitle = waiting > 1 ? "Show the next agent waiting for you" : "Show the agent waiting for you";
  const showWaiting = () => {
    const a = waitingAgents[waitCursor.current % waitingAgents.length];
    waitCursor.current++;
    if (a) sceneApi.current?.panTo(a.id);
  };

  const feed = ticks.map((t) => ({ id: t.id, text: t.text, at: t.at, agent: data.agents.find((a) => a.id === t.agentId) ?? null }));

  return (
    <div className={`flex h-full flex-col transition-opacity duration-(--motion-duration-slow) ${leaving ? "opacity-0" : ""}`}>
      <PageHeader
        title="Office"
        meta={
          <>
            {working} working ·{" "}
            {waiting > 0 && (
              <>
                <button
                  type="button"
                  onClick={showWaiting}
                  className="cursor-pointer text-foreground underline decoration-border underline-offset-2 hover:decoration-foreground"
                  title={waitingTitle}
                >
                  {waiting} waiting for you
                </button>{" "}
                ·{" "}
              </>
            )}
            {visible.length} agents
          </>
        }
        actions={
          <>
            {/* phones: the header meta line is hidden, so the waiting shortcut lives with the actions */}
            {waiting > 0 && (
              <Button size="sm" onClick={showWaiting} title={waitingTitle} className="sm:hidden">
                <StatusDot tone="waiting" />
                {waiting} waiting
              </Button>
            )}
            <Button onClick={() => sceneApi.current?.resetView()} title="Back to the opening view">
              <Icon name="fit" />
              <span className="hidden sm:inline">Reset view</span>
            </Button>
            <IconButton
              variant="secondary"
              size="icon"
              onClick={toggleSound}
              aria-pressed={sound}
              label={sound ? "Turn sound off" : "Turn sound on"}
            >
              <Icon name={sound ? "soundOn" : "soundOff"} />
            </IconButton>
          </>
        }
      />

      <div className="relative min-h-0 flex-1 overflow-hidden bg-muted">
        <OfficeScene agents={data.agents} liveRuns={data.liveRuns} onSelect={onSelect} onEvent={onEvent} selected={selected} apiRef={sceneApi} />

        {unreachable && (
          <InlineNotice tone="warning" className="absolute left-4 right-4 top-4 sm:right-auto">
            Paperclip is not reachable. Showing the last state.
          </InlineNotice>
        )}

        {visible.length === 0 && (
          <p className="absolute inset-x-0 bottom-24 text-center text-sm">No agents yet. New agents get a desk automatically.</p>
        )}

        {picked && pickedAct && (
          <div ref={pop} className="absolute left-0 top-0 z-20 w-hovercard" style={{ transform: "translate(-9999px,0)" }}>
            <div className={`pop-in relative flex flex-col gap-3 p-4 ${flyoutClass}`} role="dialog" aria-label={picked.name}>
              <IconButton label="Close" onClick={() => setSelected(null)} className="absolute right-2 top-2">
                <Icon name="close" className="size-icon-sm" />
              </IconButton>
              <div className="flex flex-col gap-1 pr-8">
                <div className="flex items-center gap-2 text-xs">
                  <ActivityStatus activity={pickedAct} />
                  {roleLabel(picked) && <span>· {roleLabel(picked)}</span>}
                </div>
                <p className="text-sm font-semibold text-foreground">{picked.name}</p>
                <p className="line-clamp-3 text-xs">{pickedTask ? `Working on: ${pickedTask}` : "No task running right now."}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={() => goChat(picked.id)} className="flex-1">
                  Chat
                </Button>
                <Button size="sm" onClick={() => router.push(`/dashboard?agent=${encodeURIComponent(picked.id)}`)} className="flex-1">
                  See tasks
                </Button>
              </div>
              <span className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-b border-r border-border bg-background" />
            </div>
          </div>
        )}

        {ticks.length > 0 && (
          <>
            {/* sm and up: the four-row card */}
            <div className={`absolute bottom-4 left-4 right-4 hidden py-2 sm:right-auto sm:block sm:w-aside ${flyoutClass}`} aria-live="polite">
              <SectionLabel className="px-3 pb-1">Activity</SectionLabel>
              <ActivityList label="Recent activity" density="compact" items={feed.slice(0, 4)} />
            </div>
            {/* phones: only the latest event as one row; a tap opens the four-row card, a tap on it (or the room) folds it */}
            {!picked && (
              <div
                role="button"
                tabIndex={0}
                aria-expanded={feedOpen}
                aria-label={feedOpen ? "Recent activity, tap to fold" : "Latest activity, tap for more"}
                onClick={() => setFeedOpen((o) => !o)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setFeedOpen((o) => !o);
                  }
                }}
                className={`absolute bottom-4 left-4 right-4 cursor-pointer sm:hidden ${feedOpen ? "py-2" : ""} ${flyoutClass}`}
              >
                {feedOpen ? (
                  <>
                    <SectionLabel className="px-3 pb-1">Activity</SectionLabel>
                    <ActivityList label="Recent activity" density="compact" items={feed.slice(0, 4)} />
                  </>
                ) : (
                  <ActivityList label="Latest activity" items={feed.slice(0, 1)} />
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

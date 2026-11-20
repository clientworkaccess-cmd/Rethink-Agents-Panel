"use client";
// Office tab: polls agents + live runs every 4 s and hands them to the lazily loaded Pixi scene.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useMemo, useRef, useState } from "react";
import { ACTIVITY_COLOR, ACTIVITY_LABEL, activityOf, runFor } from "@/lib/agents";
import { api, isUnreachable, usePoll } from "@/lib/client";
import type { AgentsPayload } from "@/lib/types";
import { StatusDot, Unreachable } from "../ui";
import type { Pointer } from "./OfficeScene";

// PixiJS lives in its own chunk and only loads when this tab opens.
const OfficeScene = dynamic(() => import("./OfficeScene"), {
  ssr: false,
  loading: () => <div className="h-[400px] w-full animate-pulse rounded-2xl bg-warm-mist/20" />,
});

const POLL_MS = 4000;

export default function Office() {
  const [data, setData] = useState<AgentsPayload | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [hover, setHover] = useState<Pointer | null>(null);
  const [selected, setSelected] = useState<Pointer | null>(null);
  const stage = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<AgentsPayload>("/api/agents"));
      setUnreachable(false);
    } catch (e) {
      if (isUnreachable(e)) setUnreachable(true);
    }
  }, []);
  usePoll(load, POLL_MS);

  const sceneAgents = useMemo(
    () =>
      (data?.agents ?? [])
        .map((agent) => ({ agent, activity: activityOf(agent, data!.liveRuns) }))
        .filter((a) => a.activity !== "hidden"),
    [data],
  );

  const info = (p: Pointer | null) => {
    if (!p || !data) return null;
    const agent = data.agents.find((a) => a.id === p.agentId);
    if (!agent) return null;
    const run = runFor(agent.id, data.liveRuns);
    return { agent, activity: activityOf(agent, data.liveRuns), task: run?.issueTitle ?? null };
  };
  const hovered = selected ? null : info(hover);
  const picked = info(selected);
  const onHover = useCallback((p: Pointer | null) => setHover(p), []);
  const onSelect = useCallback((p: Pointer) => {
    // keep the panel inside the stage
    const w = stage.current?.clientWidth ?? 9999;
    const x = Math.min(Math.max(p.x, 140), w - 140);
    setSelected((cur) => (cur?.agentId === p.agentId ? null : { ...p, x }));
  }, []);

  if (!data) return unreachable ? <Unreachable onRetry={load} /> : <div className="p-8" />;

  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto max-w-[1040px] px-4 py-6">
        <div className="mb-4 flex items-baseline justify-between">
          <h1 className="text-body-lg">Office</h1>
          <p className="text-body-sm text-graphite">
            {sceneAgents.filter((a) => a.activity === "working").length} working · {sceneAgents.length} agents
            {unreachable && " · Paperclip is not reachable, showing the last state"}
          </p>
        </div>
        <div ref={stage} className="relative" onPointerLeave={() => setHover(null)}>
          <OfficeScene agents={sceneAgents} onHover={onHover} onSelect={onSelect} />

          {hovered && hover && (
            <div
              className="pointer-events-none absolute z-10 w-56 -translate-x-1/2 -translate-y-full rounded-xl bg-soft-paper px-3 py-2 shadow-subtle ring-1 ring-warm-mist"
              style={{ left: hover.x, top: hover.y - 8 }}
            >
              <AgentInfo {...hovered} />
            </div>
          )}

          {picked && selected && (
            <div
              className="absolute z-20 w-64 -translate-x-1/2 -translate-y-full rounded-2xl bg-soft-paper p-4 shadow-subtle ring-1 ring-warm-mist"
              style={{ left: selected.x, top: selected.y - 8 }}
              role="dialog"
              aria-label={picked.agent.name}
            >
              <button
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="absolute right-2 top-2 rounded-md p-1 text-graphite hover:bg-warm-mist/40 hover:text-ink"
              >
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <path d="m4 4 8 8M12 4l-8 8" />
                </svg>
              </button>
              <AgentInfo {...picked} />
              <div className="mt-3 flex gap-2">
                <Link
                  href={`/chat?agent=${encodeURIComponent(picked.agent.id)}`}
                  className="flex-1 rounded-xl bg-ink px-3 py-1.5 text-center text-body text-parchment"
                >
                  Chat
                </Link>
                <Link
                  href={`/dashboard?agent=${encodeURIComponent(picked.agent.id)}`}
                  className="flex-1 rounded-md border border-warm-mist px-3 py-1.5 text-center text-body text-graphite hover:text-ink"
                >
                  Tasks
                </Link>
              </div>
            </div>
          )}
        </div>
        {sceneAgents.length === 0 && <p className="mt-4 text-body text-graphite">No agents yet. New agents get a desk automatically.</p>}
      </main>
    </div>
  );
}

function AgentInfo({ agent, activity, task }: { agent: { name: string; role: string }; activity: ReturnType<typeof activityOf>; task: string | null }) {
  return (
    <div className="pr-4">
      <p className="text-body text-ink">{agent.name}</p>
      {agent.role && agent.role.toLowerCase() !== agent.name.toLowerCase() && <p className="text-body-sm text-graphite">{agent.role.length <= 4 ? agent.role.toUpperCase() : agent.role}</p>}
      <p className="mt-1 flex items-center gap-1.5 text-body-sm" style={{ color: ACTIVITY_COLOR[activity] }}>
        <StatusDot activity={activity} size={7} />
        {ACTIVITY_LABEL[activity]}
      </p>
      {task && <p className="mt-1 text-body-sm text-graphite">Task: {task}</p>}
    </div>
  );
}

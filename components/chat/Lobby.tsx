"use client";
// Chat lobby: a small lounge where every agent idles. Hover: it perks up. Click: it jumps and waves and asks
// "Chat with me?" (Start new chat / Continue last chat). Choosing hops it toward the camera and fades into the chat.
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { activityOf, isThinking, roleLabel, runFor } from "@/lib/agents";
import { api } from "@/lib/client";
import type { Agent, LiveRun, SessionsPayload } from "@/lib/types";
import type { CrewApi, CrewMember } from "../character/CrewScene";
import { Button, Loading, PageHeader, flyoutClass } from "../ui";

const CrewScene = dynamic(() => import("../character/CrewScene"), { ssr: false, loading: () => <Loading label="Opening the lounge…" /> });

export default function Lobby({ agents, liveRuns }: { agents: Agent[]; liveRuns: LiveRun[] }) {
  const router = useRouter();
  const crew = useRef<CrewApi>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [last, setLast] = useState<{ agentId: string; issueId: string | null } | null>(null);
  const [leaving, setLeaving] = useState(false);

  const members: CrewMember[] = useMemo(
    () =>
      agents.map((agent) => {
        const run = runFor(agent.id, liveRuns);
        return { agent, activity: activityOf(agent, liveRuns), thinking: isThinking(run), task: run?.issueTitle ?? null };
      }),
    [agents, liveRuns],
  );

  // what "Continue last chat" opens: the most recent session for that agent
  useEffect(() => {
    if (!picked) return;
    let cancelled = false;
    api<SessionsPayload>(`/api/agents/${encodeURIComponent(picked)}/sessions`)
      .then((r) => {
        if (cancelled) return;
        const latest = [...r.sessions].sort((a, b) => String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)))[0];
        setLast({ agentId: picked, issueId: latest?.issueId ?? null });
      })
      .catch(() => !cancelled && setLast({ agentId: picked, issueId: null }));
    return () => {
      cancelled = true;
    };
  }, [picked]);

  useEffect(() => {
    if (!picked) return;
    let raf = 0;
    const follow = () => {
      const p = crew.current?.headPos(picked);
      const el = bubble.current;
      if (el && p) {
        const w = el.parentElement?.clientWidth ?? 9999;
        el.style.transform = `translate(${Math.min(Math.max(p.x, 140), w - 140)}px, ${Math.max(p.y - 6, 190)}px) translate(-50%, -100%)`;
      }
      raf = requestAnimationFrame(follow);
    };
    raf = requestAnimationFrame(follow);
    return () => cancelAnimationFrame(raf);
  }, [picked]);

  const enter = (agentId: string, session: string) => {
    crew.current?.hop(agentId);
    setLeaving(true);
    setTimeout(() => router.push(`/chat?agent=${encodeURIComponent(agentId)}&session=${encodeURIComponent(session)}`), 560);
  };

  const agent = picked ? agents.find((a) => a.id === picked) : null;
  const lastFor = last && last.agentId === picked ? last : null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader title="Chat" meta={`${agents.length} agents in the lounge`} />
      <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className={`relative z-10 flex flex-col gap-1 px-6 pt-8 text-center transition-opacity duration-(--motion-duration-slow) ${leaving ? "opacity-0" : ""}`}>
          <h2 className="text-2xl font-normal text-foreground">Who would you like to talk to?</h2>
          <p className="text-sm">Click someone to start a chat or pick up where you left off.</p>
        </div>
        <div
          className={`relative min-h-0 flex-1 transition-opacity duration-(--motion-duration-slow) ${leaving ? "opacity-0" : ""}`}
          onClick={(e) => e.target === e.currentTarget && setPicked(null)}
        >
          {agents.length > 0 ? (
            <CrewScene members={members} decor="lounge" labels bubbles maxHeight={170} onPick={setPicked} apiRef={crew} />
          ) : (
            <p className="pt-20 text-center text-sm">No agents yet. They appear here as soon as Paperclip has them.</p>
          )}
          {agent && !leaving && (
            <div ref={bubble} className="absolute left-0 top-0 z-20 w-hovercard" style={{ transform: "translate(-9999px,0)" }}>
              <div className={`pop-in relative flex flex-col gap-3 p-4 text-center ${flyoutClass}`} role="dialog" aria-label={`Chat with ${agent.name}`}>
                <div className="flex flex-col gap-1">
                  <p className="text-xs">{roleLabel(agent) || "Agent"}</p>
                  <p className="text-sm font-semibold text-foreground">Chat with me?</p>
                  <p className="text-xs">I&apos;m {agent.name}.</p>
                </div>
                <div className="flex flex-col gap-2">
                  <Button variant="primary" size="sm" onClick={() => enter(agent.id, "new")}>
                    Start new chat
                  </Button>
                  {lastFor?.issueId && (
                    <Button size="sm" onClick={() => enter(agent.id, lastFor.issueId!)}>
                      Continue last chat
                    </Button>
                  )}
                </div>
                <span className="absolute -bottom-1.5 left-1/2 size-3 -translate-x-1/2 rotate-45 border-b border-r border-border bg-background" />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

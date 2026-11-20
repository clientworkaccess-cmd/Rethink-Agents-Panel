"use client";
// Chat tab: agents (left), conversation (middle), artifact drawer (right, closed by default).
import { useCallback, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { activityOf, agentColor, hexCss } from "@/lib/agents";
import { api, isUnreachable, usePoll } from "@/lib/client";
import type { AgentsPayload, Artifact } from "@/lib/types";
import { ArtifactDrawer } from "../artifacts";
import { Avatar, StatusDot, Unreachable } from "../ui";
import Conversation from "./Conversation";

export default function Chat() {
  const router = useRouter();
  const params = useSearchParams();
  const [data, setData] = useState<AgentsPayload | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [opened, setOpened] = useState<{ agentId: string; artifact: Artifact } | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await api<AgentsPayload>("/api/agents"));
      setUnreachable(false);
    } catch (e) {
      if (isUnreachable(e)) setUnreachable(true);
    }
  }, []);
  usePoll(load, 5000);

  const agents = (data?.agents ?? []).filter((a) => a.status !== "terminated");
  const requested = params.get("agent");
  const selected =
    agents.find((a) => a.id === requested) ?? (requested ? undefined : (agents.find((a) => /cro/i.test(a.role) || /\bCRO\b/.test(a.name)) ?? agents[0]));

  // The drawer belongs to one chat: switching agents hides it.
  const artifact = opened && opened.agentId === selected?.id ? opened.artifact : null;
  const closeArtifact = useCallback(() => setOpened(null), []);
  const openArtifact = (a: Artifact) => {
    if (selected) setOpened({ agentId: selected.id, artifact: a });
  };

  if (!data) return unreachable ? <Unreachable onRetry={load} /> : null;

  return (
    <div className="flex h-full">
      <nav className="hidden w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-warm-mist/70 bg-sidebar p-3 md:flex" aria-label="Agents">
        <p className="px-2 pb-2 pt-1 text-body-sm text-graphite">Agents</p>
        {agents.map((a) => {
          const active = a.id === selected?.id;
          return (
            <button
              key={a.id}
              onClick={() => router.replace(`/chat?agent=${encodeURIComponent(a.id)}`)}
              className={`flex items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors ${
                active ? "bg-deep-teal text-white" : "text-ink hover:bg-warm-mist/30"
              }`}
            >
              <Avatar name={a.name} color={hexCss(agentColor(a.id))} size={24} />
              <span className="min-w-0 flex-1 truncate text-body">{a.name}</span>
              <span className={`inline-flex rounded-full ${active ? "ring-2 ring-white/80" : ""}`}>
                <StatusDot activity={activityOf(a, data.liveRuns)} />
              </span>
            </button>
          );
        })}
        {agents.length === 0 && <p className="px-2 text-body text-graphite">No agents yet.</p>}
      </nav>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* compact agent picker for narrow screens */}
        <div className="border-b border-warm-mist/70 p-2 md:hidden">
          <select
            aria-label="Agent"
            value={selected?.id ?? ""}
            onChange={(e) => router.replace(`/chat?agent=${encodeURIComponent(e.target.value)}`)}
            className="w-full rounded-md border border-warm-mist bg-parchment px-2 py-1.5 text-body"
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        {selected ? (
          <Conversation
            key={selected.id}
            agent={selected}
            agentRunning={activityOf(selected, data.liveRuns) === "working"}
            openArtifactId={artifact?.id ?? null}
            onOpenArtifact={openArtifact}
          />
        ) : (
          <p className="p-8 text-body text-graphite">Choose an agent to start a chat.</p>
        )}
      </div>

      {artifact && <ArtifactDrawer artifact={artifact} mode="column" onClose={closeArtifact} />}
    </div>
  );
}

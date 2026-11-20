"use client";
// Chat tab. Without ?agent: the lobby (a lounge with every agent). With ?agent: the Claude-like chat view.
import { useCallback, useState } from "react";
import { useSearchParams } from "next/navigation";
import { api, isUnreachable, usePoll } from "@/lib/client";
import type { AgentsPayload } from "@/lib/types";
import { Loading, Notice, Unreachable } from "../ui";
import ChatView from "./ChatView";
import Lobby from "./Lobby";

export default function Chat() {
  const params = useSearchParams();
  const [data, setData] = useState<AgentsPayload | null>(null);
  const [unreachable, setUnreachable] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api<AgentsPayload>("/api/agents"));
      setUnreachable(false);
    } catch (e) {
      if (isUnreachable(e)) setUnreachable(true);
    }
  }, []);
  usePoll(load, 4000);

  if (!data) return unreachable ? <Unreachable onRetry={load} /> : <Loading label="Finding the team…" />;

  const agents = data.agents.filter((a) => a.status !== "terminated");
  const agentId = params.get("agent");
  if (!agentId) return <Lobby agents={agents} liveRuns={data.liveRuns} />;
  const agent = agents.find((a) => a.id === agentId);
  if (!agent) return <Notice title="This agent is not here" text="It may have been removed. Pick someone from the lounge." mood="error" />;
  return <ChatView key={agent.id} agent={agent} agents={agents} liveRuns={data.liveRuns} sessionParam={params.get("session")} />;
}

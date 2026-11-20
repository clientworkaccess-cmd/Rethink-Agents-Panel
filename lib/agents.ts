// Status helpers shared by Office, Dashboard and Chat.
import type { Activity, Agent, LiveRun } from "./types";
export { agentColor } from "@/components/character/model";

/** Paperclip has no "waiting" status; it is derived here from status + live runs. */
export function activityOf(agent: Agent, runs: LiveRun[]): Activity {
  if (agent.status === "terminated") return "hidden";
  if (agent.status === "error") return "error";
  if (agent.status === "running" || runs.some((r) => r.agentId === agent.id)) return "working";
  if (agent.status === "paused") return "paused";
  if (agent.status === "pending_approval") return "pending";
  return "idle";
}

export const ACTIVITY_LABEL: Record<Activity, string> = {
  working: "Working",
  idle: "Idle",
  paused: "Paused",
  pending: "Waiting for you",
  error: "Error",
  hidden: "Terminated",
};

/** CSS colour per activity (functional status colours only). */
export const ACTIVITY_COLOR: Record<Activity, string> = {
  working: "var(--color-st-working)",
  idle: "var(--color-st-idle)",
  paused: "var(--color-st-paused)",
  pending: "var(--color-st-waiting)",
  error: "var(--color-st-error)",
  hidden: "var(--color-st-idle)",
};

export const ACTIVITY_HEX: Record<Activity, number> = {
  working: 0x7451f2,
  idle: 0x8a8a8a,
  paused: 0xa69ea7,
  pending: 0x0072c6,
  error: 0xc2410c,
  hidden: 0x8a8a8a,
};

export const hexCss = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

export function runFor(agentId: string, runs: LiveRun[]): LiveRun | undefined {
  return runs.find((r) => r.agentId === agentId);
}

/** A live run with no output for 10 s or more: the agent is "thinking". */
export function isThinking(run: LiveRun | undefined, now = Date.now()): boolean {
  if (!run?.lastOutputAt) return false;
  const t = new Date(run.lastOutputAt).getTime();
  return Number.isFinite(t) && now - t >= 10_000;
}

export function roleLabel(agent: { name: string; role: string }): string {
  const r = agent.role.trim();
  if (!r || r.toLowerCase() === agent.name.toLowerCase()) return "";
  return r.length <= 4 ? r.toUpperCase() : r.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

/** Trims a task title to about six words for speech bubbles. */
export function bubbleText(title: string | null | undefined, words = 6): string {
  if (!title) return "";
  const w = title.replace(/\s+/g, " ").trim().split(" ");
  return w.length <= words ? `${w.join(" ")}…` : `${w.slice(0, words).join(" ")}…`;
}

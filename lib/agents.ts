// Status and colour helpers shared by Office, Dashboard and Chat.
import type { Activity, Agent, LiveRun } from "./types";

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
  pending: "Waiting for approval",
  error: "Error",
  hidden: "Terminated",
};

/** CSS colour per activity (functional status colours only). */
export const ACTIVITY_COLOR: Record<Activity, string> = {
  working: "var(--color-st-working)",
  idle: "var(--color-st-idle)",
  paused: "var(--color-st-paused)",
  pending: "var(--color-st-paused)",
  error: "var(--color-st-error)",
  hidden: "var(--color-st-idle)",
};

export const ACTIVITY_HEX: Record<Activity, number> = {
  working: 0x016a71,
  idle: 0x92918b,
  paused: 0xb38a3e,
  pending: 0xb38a3e,
  error: 0xb4483c,
  hidden: 0x92918b,
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

// Muted, warm palette that sits well on parchment.
const PALETTE = [0x5b8a8c, 0xa77b5a, 0x7c8a5b, 0x8a6f8f, 0x5e7899, 0xb08d4f, 0x9a6262, 0x6b8f78];

/** A stable colour per agent, derived from its id. */
export function agentColor(id: string): number {
  return PALETTE[hash(id) % PALETTE.length];
}

export const hexCss = (n: number) => `#${n.toString(16).padStart(6, "0")}`;

export function runFor(agentId: string, runs: LiveRun[]): LiveRun | undefined {
  return runs.find((r) => r.agentId === agentId);
}

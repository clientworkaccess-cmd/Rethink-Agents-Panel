// Where each role goes while it works, and what it does there. Add a role by adding a key (matched against
// the agent's role, then its name, case-insensitive). Unknown roles use `default`.
// Spots: "desk" is the agent's own desk; the others are defined in world.ts (SPOTS).
import type { Step } from "@/components/character/brain";

export const ROLE_STEPS: Record<string, Step[]> = {
  // Chief Revenue Officer: points at the chart wall, writes on the whiteboard, then types at the desk.
  cro: [
    { spot: "chartWall", action: "study" },
    { spot: "whiteboard", action: "write" },
    { spot: "desk", action: "type" },
  ],
  // Marketing: pins ideas on the campaign board, announces with the megaphone, then types.
  cmo: [
    { spot: "posterBoard", action: "pin" },
    { spot: "stage", action: "announce" },
    { spot: "desk", action: "type" },
  ],
  analyst: [
    { spot: "chartWall", action: "inspect" },
    { spot: "desk", action: "type" },
  ],
  default: [{ spot: "desk", action: "type" }],
};

export function stepsFor(role: string, name: string): Step[] {
  const r = role.toLowerCase();
  const n = name.toLowerCase();
  const key =
    Object.keys(ROLE_STEPS).find((k) => k !== "default" && r === k) ??
    Object.keys(ROLE_STEPS).find((k) => k !== "default" && (r.includes(k) || new RegExp(`\\b${k}\\b`).test(n)));
  return ROLE_STEPS[key ?? "default"];
}

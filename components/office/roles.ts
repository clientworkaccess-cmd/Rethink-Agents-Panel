// Where each role goes while it works. Add a role by adding a key (matched against the agent's
// role, then its name, case-insensitive). Unknown roles use `default`.
// Spots: "desk" is the agent's own desk; the others are on the office wall (see layout.ts).

export type SpotName = "desk" | "chartWall" | "whiteboard" | "posterBoard";
export type Action = "type" | "study" | "write" | "pin";
export type Step = { spot: SpotName; action: Action };

export const ROLE_STEPS: Record<string, Step[]> = {
  // Chief Revenue Officer: studies the charts, works on the whiteboard, then writes at the desk.
  cro: [
    { spot: "chartWall", action: "study" },
    { spot: "whiteboard", action: "write" },
    { spot: "desk", action: "type" },
  ],
  // Marketing (later): the campaign / poster board.
  cmo: [
    { spot: "posterBoard", action: "pin" },
    { spot: "desk", action: "type" },
  ],
  analyst: [
    { spot: "chartWall", action: "study" },
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

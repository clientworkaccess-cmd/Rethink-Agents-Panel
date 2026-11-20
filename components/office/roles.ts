// Where each role goes while it works, and what it does there. The role kind comes from the agent's role and
// name (model.ts roleKind), the same kind that picks its outfit and prop. Add a role kind there, then here.
// Spots: "desk" is the agent's own cubicle; the others are shared areas defined in world.ts (layout.spots).
// The brain walks the list in a loop while the agent is working, so every agent keeps coming back to its desk.
import type { Step } from "@/components/character/brain";
import { roleKind, type RoleKind } from "@/components/character/model";

const desk: Step = { spot: "desk", action: "type" };

export const ROLE_STEPS: Record<RoleKind, Step[]> = {
  // Chief Revenue Officer: studies the chart wall, writes on the whiteboard, presents at the meeting screen.
  cro: [{ spot: "chartWall", action: "study" }, { spot: "whiteboard", action: "write" }, { spot: "meetingScreen", action: "present" }, desk],
  // Marketing: pins ideas on the notice board, announces with the megaphone by the meeting screen.
  cmo: [{ spot: "noticeBoard", action: "pin" }, { spot: "meetingScreen", action: "announce" }, desk],
  analyst: [{ spot: "chartWall", action: "inspect" }, { spot: "serverRack", action: "tinker" }, desk],
  cfo: [{ spot: "chartWall", action: "study" }, { spot: "meetingTable", action: "meet" }, desk],
  ceo: [{ spot: "meetingScreen", action: "present" }, { spot: "whiteboard", action: "write" }, desk],
  coo: [{ spot: "noticeBoard", action: "pin" }, { spot: "meetingTable", action: "meet" }, desk],
  ops: [{ spot: "noticeBoard", action: "pin" }, { spot: "meetingTable", action: "meet" }, desk],
  cto: [{ spot: "serverRack", action: "tinker" }, { spot: "whiteboard", action: "write" }, desk],
  dev: [{ spot: "serverRack", action: "tinker" }, { spot: "whiteboard", action: "write" }, desk],
  design: [{ spot: "whiteboard", action: "write" }, { spot: "noticeBoard", action: "pin" }, desk],
  support: [{ spot: "meetingTable", action: "meet" }, desk],
  sales: [{ spot: "chartWall", action: "study" }, { spot: "meetingTable", action: "meet" }, desk],
  default: [{ spot: "whiteboard", action: "write" }, desk],
};

export function stepsFor(role: string, name: string): Step[] {
  return ROLE_STEPS[roleKind(role, name)];
}

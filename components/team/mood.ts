import type { Activity } from "@/lib/types";
import type { CritterMood } from "../character/Critter";

/** The character's face follows the agent's activity, same reading as the Office. */
export function moodFor(activity: Activity): CritterMood {
  if (activity === "working") return "busy";
  if (activity === "paused") return "sleep";
  if (activity === "error") return "error";
  if (activity === "pending") return "wave";
  return "idle";
}

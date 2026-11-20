// Per-character movement state. Plain logic, no Pixi: the scene reads `pos`, `mode` and `action` each frame.
import { route, WALL_SPOTS, type Pt } from "./layout";
import type { Action, Step } from "./roles";

const SPEED = 52; // px per second: a calm walk
const DWELL_MS: [number, number] = [5000, 8000];

export type Mode = "sit" | "walk" | "work";

export class Brain {
  pos: Pt;
  mode: Mode = "sit";
  action: Action = "type";
  /** True while the character sits at its desk (seated pose, legs hidden by the desk). */
  seated = true;
  private path: Pt[] = [];
  private goal: { step: number | null } = { step: null };
  private stepIndex = 0;
  private dwell = 0;

  constructor(
    public seat: Pt,
    public gapX: number,
    private slot: number,
  ) {
    this.pos = { ...seat };
  }

  /** Moves the desk (only if the desk grid changes). The character walks there. */
  setDesk(seat: Pt, gapX: number) {
    if (seat.x === this.seat.x && seat.y === this.seat.y) return;
    this.seat = seat;
    this.gapX = gapX;
    if (this.mode === "sit") this.walkTo(seat, null);
  }

  private spot(step: Step): Pt {
    if (step.spot === "desk") return this.seat;
    const p = WALL_SPOTS[step.spot];
    return { x: p.x + ((this.slot % 3) - 1) * 30, y: p.y };
  }

  private walkTo(target: Pt, step: number | null) {
    this.path = route(this.pos, target, this.gapX);
    this.goal = { step };
    this.seated = false;
    this.mode = this.path.length ? "walk" : this.mode;
    if (!this.path.length) this.arrive();
  }

  private arrive() {
    const atSeat = Math.hypot(this.pos.x - this.seat.x, this.pos.y - this.seat.y) < 1;
    this.seated = atSeat;
    if (this.goal.step === null) {
      this.mode = "sit";
    } else {
      this.mode = "work";
      this.dwell = DWELL_MS[0] + Math.random() * (DWELL_MS[1] - DWELL_MS[0]);
    }
  }

  update(dtMs: number, working: boolean, steps: Step[]) {
    if (this.mode === "walk") {
      // If the reason for walking went away, re-plan.
      const headingToWork = this.goal.step !== null;
      if (headingToWork !== working) {
        if (working) this.startStep(steps, 0);
        else this.walkTo(this.seat, null);
        return;
      }
      let budget = (SPEED * dtMs) / 1000;
      while (budget > 0 && this.path.length) {
        const next = this.path[0];
        const dx = next.x - this.pos.x;
        const dy = next.y - this.pos.y;
        const d = Math.hypot(dx, dy);
        if (d <= budget) {
          this.pos = { ...next };
          this.path.shift();
          budget -= d;
        } else {
          this.pos = { x: this.pos.x + (dx / d) * budget, y: this.pos.y + (dy / d) * budget };
          budget = 0;
        }
      }
      if (!this.path.length) this.arrive();
      return;
    }

    if (!working) {
      if (this.mode === "work") this.walkTo(this.seat, null);
      return;
    }

    if (this.mode === "sit") {
      this.startStep(steps, 0);
      return;
    }

    // working at a spot
    if (steps.length > 1) {
      this.dwell -= dtMs;
      if (this.dwell <= 0) this.startStep(steps, (this.stepIndex + 1) % steps.length);
    }
  }

  private startStep(steps: Step[], index: number) {
    this.stepIndex = index;
    const step = steps[index] ?? steps[0];
    this.action = step.action;
    this.walkTo(this.spot(step), index);
  }
}

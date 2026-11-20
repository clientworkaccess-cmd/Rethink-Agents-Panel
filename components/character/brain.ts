// The per-character state machine (one module, no Pixi): decides what a character is doing from the
// agent's Paperclip activity plus random idle behaviours, moves it along paths, and produces a Pose and
// a bubble every frame. To add a state: add it to `State`, give it a pose in POSES, and route to it in
// `decide()`.
//
//   idle (sit) ──run starts──▶ walk ──▶ work ⇄ think ──run ends──▶ done (celebrate) ──▶ walk ──▶ idle
//        └──── long idle ───▶ doze / read            error / wait / paused: back at the desk
import type { Activity } from "@/lib/types";
import { NEUTRAL, type BubbleKind, type Pose } from "./rig";

export type Pt = { x: number; y: number };
export type WorkAction = "type" | "study" | "write" | "pin" | "announce" | "inspect" | "present" | "tinker" | "meet";
export type Step = { spot: string; action: WorkAction };

export type State = "sit" | "walk" | "work" | "think" | "wait" | "error" | "paused" | "done" | "doze" | "read";
type IdleAct = "look" | "sip" | "stretch" | "yawn" | "swing" | "glance" | "hum" | "show";

/** Movement support. Scenes without walking (lobby, dashboard strip) pass none. */
export interface Navigator {
  home: Pt;
  spot(step: Step, slot: number): Pt;
  path(from: Pt, to: Pt): Pt[];
}

export type BrainInput = {
  activity: Activity;
  thinking: boolean;
  task: string;
  steps: Step[];
  /** Greeting another character, set by the scene. */
  reduced: boolean;
};

const SPEED = 74; // px/s
const IDLE_LONG_MS = 120_000;
const DWELL_MS: [number, number] = [7000, 11000];
const DONE_MS = 1900;
const WAVE_MS = 1300;
const EMBLEM_HOVER_MS = 350;
const IDLE_ACTS: IdleAct[] = ["look", "sip", "stretch", "yawn", "swing", "glance", "hum", "show"];

const rnd = (a: number, b: number) => a + Math.random() * (b - a);
const ease = (x: number) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2);

export class CharacterBrain {
  pos: Pt;
  state: State = "sit";
  bubble: { kind: BubbleKind; text: string } = { kind: null, text: "" };
  private t = Math.random() * 100;
  private nav: Navigator | null;
  private path: Pt[] = [];
  private pathGoal: string | null = null;
  private walkTotal = 0;
  private walkDone = 0;
  private facing = 1;
  private away = false;
  private idleAct: IdleAct = "look";
  private idleUntil = 0;
  private idleSince = 0;
  private blinkAt = rnd(1, 4);
  private stepIndex = 0;
  private dwell = 0;
  private doneLeft = 0;
  private waveLeft = 0;
  private greetLeft = 0;
  private prevActivity: Activity | null = null;
  private lookTarget: Pt | null = null;
  private longIdleKind: "doze" | "read" = Math.random() < 0.5 ? "doze" : "read";
  hovered = false;
  /** How long the pointer has rested on this character (ms); the emblem waits for EMBLEM_HOVER_MS. */
  private hoverMs = 0;
  /** Set by the scene while this agent's click card is open: no hover emblem then. */
  cardOpen = false;

  constructor(
    nav: Navigator | null,
    private slot = 0,
    start?: Pt,
  ) {
    this.nav = nav;
    this.pos = start ?? (nav ? { ...nav.home } : { x: 0, y: 0 });
  }

  setNavigator(nav: Navigator) {
    this.nav = nav;
    this.pathGoal = null;
  }

  /** Clicked: jump and wave. */
  wave() {
    this.waveLeft = WAVE_MS;
  }

  /** Brief friendly wave when passing another character. */
  greet() {
    if (this.greetLeft <= 0 && this.waveLeft <= 0) this.greetLeft = 900;
  }

  /** Where the cursor is (in the same space as `pos`), or null. */
  lookAt(p: Pt | null) {
    this.lookTarget = p;
  }

  get walking() {
    return this.state === "walk";
  }

  private atHome() {
    return !this.nav || Math.hypot(this.pos.x - this.nav.home.x, this.pos.y - this.nav.home.y) < 1;
  }

  /** Decides where to be and what to do. */
  private decide(inp: BrainInput, dt: number): { place: Pt | null; key: string; state: State } {
    const home = this.nav?.home ?? null;
    if (inp.activity === "working") {
      const steps = inp.steps.length ? inp.steps : [{ spot: "desk", action: "type" as WorkAction }];
      if (this.state === "work" || this.state === "think") {
        this.dwell -= dt;
        if (this.dwell <= 0 && steps.length > 1) {
          this.stepIndex = (this.stepIndex + 1) % steps.length;
          this.dwell = rnd(...DWELL_MS);
        }
      }
      const step = steps[this.stepIndex % steps.length];
      const place = this.nav ? (step.spot === "desk" ? this.nav.home : this.nav.spot(step, this.slot)) : null;
      return { place, key: `work:${this.stepIndex}`, state: inp.thinking ? "think" : "work" };
    }
    const state: State =
      inp.activity === "error"
        ? "error"
        : inp.activity === "pending"
          ? "wait"
          : inp.activity === "paused"
            ? "paused"
            : this.idleSince > IDLE_LONG_MS
              ? this.longIdleKind
              : "sit";
    return { place: home, key: "home", state };
  }

  update(dtMs: number, inp: BrainInput): Pose {
    const dt = Math.min(dtMs, 100);
    this.t += dt / 1000;
    this.waveLeft = Math.max(0, this.waveLeft - dt);
    this.greetLeft = Math.max(0, this.greetLeft - dt);
    // continuous hover only: pointer-out resets the emblem delay
    this.hoverMs = this.hovered ? this.hoverMs + dt : 0;

    // a run just ended: celebrate where we are, then go back
    if (this.prevActivity === "working" && inp.activity !== "working" && inp.activity !== "error") this.doneLeft = DONE_MS;
    if (this.prevActivity !== "working" && inp.activity === "working") {
      this.stepIndex = 0;
      this.dwell = rnd(...DWELL_MS);
      this.doneLeft = 0;
    }
    this.prevActivity = inp.activity;
    this.idleSince = inp.activity === "idle" && this.state !== "walk" && this.state !== "done" ? this.idleSince + dt : 0;

    if (this.doneLeft > 0) {
      this.doneLeft -= dt;
      this.state = "done";
    } else {
      const goal = this.decide(inp, dt);
      if (goal.place && Math.hypot(goal.place.x - this.pos.x, goal.place.y - this.pos.y) > 1) {
        if (inp.reduced) {
          this.pos = { ...goal.place };
          this.state = goal.state;
        } else {
          if (this.pathGoal !== goal.key || this.state !== "walk") this.planWalk(goal.place, goal.key);
          this.state = "walk";
          this.stepWalk(dt);
        }
      } else {
        if (this.state === "walk") this.pathGoal = null;
        this.state = goal.state;
      }
    }

    this.updateBubble(inp);
    return this.pose(inp);
  }

  private planWalk(to: Pt, key: string) {
    this.path = this.nav ? this.nav.path(this.pos, to) : [to];
    if (!this.path.length) this.path = [to];
    this.pathGoal = key;
    this.walkDone = 0;
    let prev = this.pos;
    this.walkTotal = 0;
    for (const p of this.path) {
      this.walkTotal += Math.hypot(p.x - prev.x, p.y - prev.y);
      prev = p;
    }
  }

  private stepWalk(dt: number) {
    // ease in at the start and out at the end of the whole walk (no linear robot motion)
    const remaining = this.walkTotal - this.walkDone;
    const ramp = Math.min(1, (this.walkDone + 6) / 30, (remaining + 6) / 30);
    let budget = (SPEED * (0.35 + 0.65 * ease(Math.max(0, ramp))) * dt) / 1000;
    while (budget > 0 && this.path.length) {
      const next = this.path[0];
      const dx = next.x - this.pos.x;
      const dy = next.y - this.pos.y;
      const d = Math.hypot(dx, dy);
      if (d > 0.01) {
        if (Math.abs(dx) > 0.5) this.facing = dx > 0 ? 1 : -1;
        this.away = dy < -Math.abs(dx) * 0.8;
      }
      if (d <= budget) {
        this.pos = { ...next };
        this.path.shift();
        budget -= d;
        this.walkDone += d;
      } else {
        this.pos = { x: this.pos.x + (dx / d) * budget, y: this.pos.y + (dy / d) * budget };
        this.walkDone += budget;
        budget = 0;
      }
    }
  }

  private updateBubble(inp: BrainInput) {
    const b = (kind: BubbleKind, text = "") => (this.bubble = { kind, text });
    switch (this.state) {
      case "work": {
        // the task title, then a little typing / code bubble, alternating
        const phase = (this.t % 9) / 9;
        if (phase < 0.6 && inp.task) b("text", inp.task);
        else {
          const act = inp.steps[this.stepIndex % Math.max(1, inp.steps.length)]?.action;
          const alt = Math.floor(this.t / 9) % 2 === 1;
          b(act === "type" ? (alt ? "code" : "dots") : act === "tinker" ? (alt ? "gear" : "code") : "dots");
        }
        break;
      }
      case "think":
        b(Math.floor(this.t / 4) % 2 ? "gear" : "think");
        break;
      case "wait":
        b("wait");
        break;
      case "error":
        b("error");
        break;
      case "paused":
        b("pause");
        break;
      case "done":
        b("sparkle");
        break;
      case "doze":
        b("zzz");
        break;
      default:
        b(null);
    }
  }

  private nextIdleAct(seated: boolean) {
    // "glance" (at the monitor) needs a desk; "show" (the role emblem) needs to be standing
    const options = IDLE_ACTS.filter((a) => a !== this.idleAct && (seated ? a !== "show" : a !== "glance"));
    this.idleAct = options[Math.floor(Math.random() * options.length)];
    this.idleUntil = this.t + rnd(3.2, 5.8);
  }

  private pose(inp: BrainInput): Pose {
    const t = this.t;
    const seated = !!this.nav && this.atHome() && this.state !== "walk" && this.state !== "done";
    const p: Pose = { ...NEUTRAL, seated, flip: this.facing };

    // always on: breathing and blinking (blink every 2-6 s, sometimes double)
    p.squash = 1 + Math.sin(t * 1.9) * 0.022;
    p.eyeOpen = this.blinkPhase(t);

    if (inp.reduced) {
      // still, except for blinking
      p.squash = 1;
      return this.applyOverlays(p, inp, true);
    }

    POSES[this.state](p, { t, brain: this, inp, seated });
    return this.applyOverlays(p, inp, false);
  }

  private blinkStart = 0;
  private blinkPhase(t: number): number {
    if (t >= this.blinkAt) {
      this.blinkStart = t;
      this.blinkAt = t + rnd(2, 6);
    }
    const age = t - this.blinkStart;
    if (age < 0.07) return 1 - age / 0.07;
    if (age < 0.15) return (age - 0.07) / 0.08;
    return 1;
  }

  private applyOverlays(p: Pose, _inp: BrainInput, reduced: boolean): Pose {
    // look at the cursor while hovered
    if (this.hovered && this.lookTarget) {
      const dx = this.lookTarget.x - this.pos.x;
      const dy = this.lookTarget.y - (this.pos.y - 58);
      const d = Math.max(1, Math.hypot(dx, dy));
      p.lookX = Math.max(-1, Math.min(1, (dx / d) * 1.3)) * p.flip;
      p.lookY = Math.max(-1, Math.min(1, (dy / d) * 1.3));
      p.away = false;
      if (p.mouth === "flat" || p.mouth === "sleep") p.mouth = "smile";
      // perk up at once: eyes open, slight lift
      p.eyeOpen = Math.max(p.eyeOpen, 0.95);
      p.squash = Math.max(p.squash, 1.03);
    }
    if (reduced) return p;
    // after a short, continuous hover the role emblem appears on an open palm, unless something else is
    // already talking for the character (a task or waiting bubble), it is walking, or its card is open
    const busyBubble = ["text", "dots", "code", "think", "gear", "wait"].includes(this.bubble.kind ?? "");
    if (this.hovered && this.hoverMs >= EMBLEM_HOVER_MS && this.state !== "walk" && !busyBubble && !this.cardOpen) {
      p.emblem = true;
      p.armL = 1.15;
      if (p.hold === "mug" || p.hold === "book") p.hold = "none";
    }
    if (this.waveLeft > 0) {
      const k = 1 - this.waveLeft / WAVE_MS;
      p.bodyY = -Math.max(0, Math.sin(Math.min(1, k * 2.2) * Math.PI)) * 12;
      p.armR = 2.7 + Math.sin(this.t * 16) * 0.4;
      p.mouth = "grin";
      p.sparkle = k < 0.5;
      p.away = false;
      p.lookX = 0;
      p.lookY = 0.2;
      p.hold = "none";
    } else if (this.greetLeft > 0) {
      p.armR = 2.5 + Math.sin(this.t * 14) * 0.35;
      p.mouth = "grin";
    }
    return p;
  }

  /** Called by POSES: switch idle behaviours on their own timer. */
  idleActFor(seated: boolean): IdleAct {
    if (this.t >= this.idleUntil) this.nextIdleAct(seated);
    return this.idleAct;
  }

  idleProgress(): number {
    return 1 - Math.max(0, this.idleUntil - this.t) / 4.5;
  }

  stepAction(inp: BrainInput): WorkAction {
    return inp.steps[this.stepIndex % Math.max(1, inp.steps.length)]?.action ?? "type";
  }

  get hasRoom() {
    return this.nav !== null;
  }

  get isAway() {
    return this.away;
  }

  get doneProgress() {
    return 1 - Math.max(0, this.doneLeft) / DONE_MS;
  }
}

type Ctx = { t: number; brain: CharacterBrain; inp: BrainInput; seated: boolean };

/** One pose function per state. They modify the pose in place. */
const POSES: Record<State, (p: Pose, c: Ctx) => void> = {
  sit: (p, { t, brain, seated }) => {
    const act = brain.idleActFor(seated);
    const k = Math.min(1, brain.idleProgress() * 3); // ease into the act
    const wob = Math.sin(t * 2.2);
    if (!seated) p.hold = "prop";
    switch (act) {
      case "look":
        p.lookX = Math.sin(t * 0.9) > 0 ? 0.9 : -0.9;
        p.lookY = -0.2;
        p.headTilt = p.lookX * 0.08;
        break;
      case "sip":
        p.hold = "mug";
        p.armL = -2.35 * k + Math.sin(t * 1.4) * 0.08;
        p.headTilt = -0.08 * k;
        p.eyeOpen = Math.min(p.eyeOpen, 0.55);
        p.mouth = "o";
        break;
      case "stretch":
        p.armL = 2.9 * k;
        p.armR = 2.9 * k;
        p.squash = 1 + 0.06 * k + Math.sin(t * 3) * 0.01;
        p.eyeOpen = 0.12;
        p.mouth = "o";
        break;
      case "yawn":
        p.armR = -2.5 * k;
        p.mouth = "o";
        p.eyeOpen = Math.min(p.eyeOpen, 0.3);
        p.headTilt = -0.1 * k;
        p.squash = 1.03;
        break;
      case "swing":
        p.legL = Math.sin(t * 4) * 0.4;
        p.legR = Math.sin(t * 4 + Math.PI) * 0.4;
        p.headTilt = wob * 0.06;
        p.mouth = "smile";
        if (!seated) {
          // standing: tap a foot instead
          p.legL = 0;
          p.legR = Math.max(0, Math.sin(t * 8)) * -0.25;
        }
        break;
      case "glance":
        p.lookX = -0.9;
        p.lookY = 0.3;
        p.armL = -1.1 + Math.sin(t * 9) * 0.06;
        p.armR = -1.1 - Math.sin(t * 9) * 0.06;
        p.mouth = "flat";
        break;
      case "show": // the role emblem floats over an open palm
        p.emblem = true;
        p.armL = 1.15 * k + Math.sin(t * 2) * 0.04;
        p.lookX = -0.7;
        p.lookY = -0.5;
        p.headTilt = -0.06;
        p.mouth = "grin";
        break;
      case "hum":
        p.headTilt = Math.sin(t * 2.6) * 0.14;
        p.lean = Math.sin(t * 2.6) * 0.04;
        p.eyeOpen = Math.min(p.eyeOpen, 0.35);
        p.mouth = "smile";
        break;
    }
  },
  doze: (p, { t }) => {
    p.eyeOpen = 0.08;
    p.mouth = "sleep";
    p.headTilt = 0.22 + Math.sin(t * 0.8) * 0.04;
    p.squash = 1 + Math.sin(t * 1.1) * 0.035;
    p.armL = 0.05;
    p.armR = 0.05;
  },
  read: (p, { t }) => {
    p.hold = "book";
    p.armL = -0.95;
    p.armR = -0.95;
    p.lookY = 0.8;
    p.lookX = Math.sin(t * 0.7) * 0.6;
    p.headTilt = 0.05;
    p.mouth = "smile";
  },
  walk: (p, { t, brain }) => {
    const ph = t * 9.5;
    p.legL = Math.sin(ph) * 0.5;
    p.legR = -Math.sin(ph) * 0.5;
    p.armL = 0.15 - Math.sin(ph) * 0.45;
    p.armR = 0.15 + Math.sin(ph) * 0.45;
    p.bodyY = -Math.abs(Math.sin(ph)) * 2.6;
    p.squash = 1 + Math.abs(Math.cos(ph)) * 0.02;
    p.lean = brain.isAway ? 0 : 0.05 * p.flip;
    p.away = brain.isAway;
    p.hold = "prop";
    p.lookX = 0.5;
  },
  work: (p, c) => {
    workPose(p, c);
    // scenes without a room (lounge, team strip) have no board to face: stay turned toward the viewer
    if (!c.brain.hasRoom) p.away = false;
  },
  think: (p, { t }) => {
    p.armR = -2.55;
    p.armL = 0.1;
    p.lookX = 0.7;
    p.lookY = -0.8;
    p.eyeOpen = Math.min(p.eyeOpen, 0.5);
    p.mouth = "flat";
    p.headTilt = 0.08 + Math.sin(t * 1.2) * 0.04;
    p.legR = Math.max(0, Math.sin(t * 6)) * -0.15;
  },
  wait: (p, { t }) => {
    p.lookX = 0;
    p.lookY = 0.35;
    p.mouth = "o";
    p.bodyY = -Math.abs(Math.sin(t * 3)) * 1.2;
    p.armR = Math.sin(t * 0.8) > 0.6 ? 2.4 + Math.sin(t * 12) * 0.3 : 0.2;
  },
  error: (p, { t }) => {
    p.squash = 0.92;
    p.lean = 0.12;
    p.headTilt = 0.3;
    p.lookY = 0.9;
    p.eyeOpen = Math.min(p.eyeOpen, 0.45);
    p.mouth = "frown";
    p.armL = -0.2;
    p.armR = -0.2;
    p.bodyY = 1 + Math.sin(t * 1.2) * 0.4;
  },
  paused: (p, { t }) => {
    p.eyeOpen = Math.min(p.eyeOpen, 0.6);
    p.mouth = "flat";
    p.headTilt = Math.sin(t * 0.6) * 0.05;
  },
  done: (p, { t, brain }) => {
    const k = brain.doneProgress;
    const hops = Math.abs(Math.sin(k * Math.PI * 2));
    p.bodyY = -hops * 14;
    p.squash = 1 + (hops < 0.15 ? -0.08 : 0.04);
    p.armL = 2.6 + Math.sin(t * 14) * 0.25;
    p.armR = 2.6 - Math.sin(t * 14) * 0.25;
    p.mouth = "grin";
    p.sparkle = true;
    p.legL = -0.2 * hops;
    p.legR = 0.2 * hops;
  },
};

function workPose(p: Pose, { t, brain, inp, seated }: Ctx) {
  const action = seated ? "type" : brain.stepAction(inp);
  switch (action) {
    case "type": {
      const fast = Math.sin(t * 22);
      p.armL = -1.15 + fast * 0.08;
      p.armR = -1.15 - fast * 0.08;
      p.lookX = -0.6;
      p.lookY = 0.4;
      p.mouth = "flat";
      p.headTilt = Math.sin(t * 1.3) * 0.03;
      p.bodyY = Math.abs(fast) * -0.5;
      break;
    }
    case "study": // points at the chart wall, then studies the tablet
      if (Math.sin(t * 0.7) > -0.2) {
        p.armR = 2.85 + Math.sin(t * 3) * 0.1;
        p.lookY = -0.9;
        p.lookX = 0.4;
        p.mouth = "o";
      } else {
        // then holds up the role emblem (a revenue coin for the CRO) and considers it
        p.emblem = true;
        p.armL = 1.2;
        p.lookX = -0.8;
        p.lookY = -0.6;
        p.mouth = "smile";
      }
      p.headTilt = -0.06;
      break;
    case "write": // back to us, writing on the whiteboard
      p.away = true;
      p.armR = 2.4 + Math.sin(t * 5) * 0.25;
      p.armL = 0.15;
      p.lean = Math.sin(t * 2.5) * 0.04;
      p.legL = Math.max(0, Math.sin(t * 2.5)) * 0.1;
      break;
    case "pin":
      p.away = true;
      p.armR = 2.6 + Math.sin(t * 4) * 0.15;
      p.armL = 2.0 + Math.cos(t * 4) * 0.15;
      p.bodyY = -Math.max(0, Math.sin(t * 4)) * 3;
      break;
    case "announce": // megaphone up
      p.hold = "prop";
      p.armR = -2.2 + Math.sin(t * 6) * 0.08;
      p.armL = 1.2 + Math.sin(t * 6) * 0.3;
      p.bodyY = -Math.abs(Math.sin(t * 6)) * 3;
      p.mouth = "grin";
      break;
    case "present": // at the meeting screen: points at it, then turns to the room with the emblem
      if (Math.sin(t * 0.8) > 0) {
        p.armR = 2.2 + Math.sin(t * 3) * 0.12;
        p.lookX = 0.8;
        p.lookY = -0.6;
        p.mouth = Math.sin(t * 9) > 0 ? "o" : "smile";
      } else {
        p.emblem = true;
        p.armL = 1.2;
        p.armR = 0.6 + Math.sin(t * 4) * 0.2;
        p.lookX = 0;
        p.mouth = Math.sin(t * 8) > 0.2 ? "grin" : "smile";
      }
      p.bodyY = -Math.abs(Math.sin(t * 2.4)) * 1.2;
      break;
    case "meet": // talking things through at the meeting table
      p.armL = 0.6 + Math.sin(t * 3.2) * 0.35;
      p.armR = 0.4 + Math.cos(t * 2.6) * 0.3;
      p.lookX = Math.sin(t * 0.6) > 0 ? 0.8 : -0.8;
      p.headTilt = Math.sin(t * 1.4) * 0.06;
      p.mouth = Math.sin(t * 7) > 0.3 ? "o" : "smile";
      break;
    case "tinker": { // at the server rack, back to us: hands on the panel, nodding along
      const fast = Math.sin(t * 16);
      p.away = true;
      p.armL = 1.9 + fast * 0.12;
      p.armR = 1.7 - fast * 0.12;
      p.lookX = 0.2;
      p.lookY = 0.1;
      p.headTilt = Math.sin(t * 2) * 0.05;
      p.mouth = "flat";
      break;
    }
    case "inspect": // magnifier sweep
      p.hold = "prop";
      p.armR = -1.4 + Math.sin(t * 2) * 0.35;
      p.lookX = Math.sin(t * 2) * 0.8;
      p.lookY = 0.3;
      p.mouth = "o";
      break;
  }
}

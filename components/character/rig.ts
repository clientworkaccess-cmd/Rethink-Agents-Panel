// The layered vector character for Pixi scenes (Office, Chat lobby, Dashboard team strip).
// Every part (legs, feet, body, arms, hands, head, eyes, mouth, prop) is its own display object,
// so animation is procedural on the parts: the rig eases each part toward the Pose the brain asks for.
// All art is original, drawn here with Pixi Graphics.
import { Container, Graphics, Text } from "pixi.js";
import { mix, type Look } from "./model";

export type Mouth = "smile" | "grin" | "o" | "flat" | "frown" | "sleep";
export type Hold = "none" | "prop" | "mug" | "book";
export type BubbleKind = "text" | "think" | "gear" | "wait" | "error" | "zzz" | "sparkle" | "dots" | "code" | "pause" | null;

/** What the brain wants the body to do this frame. Angles in radians. */
export type Pose = {
  /** Arm raise: 0 = hanging, + = up and out, - = in front / across the body. */
  armL: number;
  armR: number;
  /** Leg swing from the hip. */
  legL: number;
  legR: number;
  /** Vertical body offset (jump/bounce), negative = up. */
  bodyY: number;
  /** Body scale.y (breathing, squash and stretch). */
  squash: number;
  /** Whole-character lean. */
  lean: number;
  headTilt: number;
  /** Where the eyes look, -1..1. */
  lookX: number;
  lookY: number;
  /** 0 closed .. 1 open. */
  eyeOpen: number;
  sparkle: boolean;
  mouth: Mouth;
  hold: Hold;
  seated: boolean;
  /** 1 = facing right/camera, -1 = mirrored. */
  flip: number;
  /** Back view (walking away, writing on the board). */
  away: boolean;
};

export const NEUTRAL: Pose = {
  armL: 0.12,
  armR: 0.12,
  legL: 0,
  legR: 0,
  bodyY: 0,
  squash: 1,
  lean: 0,
  headTilt: 0,
  lookX: 0,
  lookY: 0,
  eyeOpen: 1,
  sparkle: false,
  mouth: "smile",
  hold: "none",
  seated: false,
  flip: 1,
  away: false,
};

const INK = 0x2a1f3d;
const SMOOTH = ["armL", "armR", "legL", "legR", "bodyY", "squash", "lean", "headTilt", "lookX", "lookY", "eyeOpen"] as const;

export class CharacterRig {
  readonly root = new Container();
  /** Everything above the shadow; bounces and jumps. */
  private body = new Container();
  private shadow = new Graphics();
  private ring = new Graphics();
  private legL = new Container();
  private legR = new Container();
  private torso = new Graphics();
  private armL = new Container();
  private armR = new Container();
  private head = new Container();
  private face = new Container();
  private backHead = new Graphics();
  private eyeL = new Container();
  private eyeR = new Container();
  private pupils: Graphics[] = [];
  private stars: Graphics[] = [];
  private mouths = new Map<Mouth, Graphics>();
  private prop = new Container();
  private mug = new Graphics();
  private book = new Graphics();
  private bubble = new Container();
  private bubbleBg = new Graphics();
  private bubbleText: Text;
  private bubbleFx = new Graphics();
  private label: Text | null = null;
  private cur: Pose = { ...NEUTRAL };
  private bubbleKind: BubbleKind = null;
  private bubbleMsg = "";
  private t = Math.random() * 10;

  constructor(
    private look: Look,
    opts: { label?: string; labelColor?: number; ring?: number | null } = {},
  ) {
    const { color, shade, light, limb } = look;
    this.root.sortableChildren = false;

    this.ring.visible = false;
    if (opts.ring != null) this.setRing(opts.ring);
    this.shadow.ellipse(0, 0, 15, 4.5).fill({ color: 0x000000, alpha: 0.12 });
    this.root.addChild(this.ring, this.shadow, this.body);

    // legs: pivot at the hip, foot at the end
    for (const [leg, x] of [
      [this.legL, -6.5],
      [this.legR, 6.5],
    ] as const) {
      leg.position.set(x, -16);
      const g = new Graphics();
      g.roundRect(-3, -1, 6, 14, 3).fill(limb);
      g.ellipse(x < 0 ? -1 : 1, 14, 5.5, 3.2).fill(shade);
      g.ellipse(x < 0 ? -2.5 : -0.5, 13, 2.2, 1.1).fill({ color: 0xffffff, alpha: 0.25 });
      leg.addChild(g);
      this.body.addChild(leg);
    }

    // torso: a chubby bean with soft clay shading and a highlight
    this.torso.ellipse(0, -29, 15, 14).fill(color);
    this.torso.ellipse(0, -21, 13, 6).fill({ color: shade, alpha: 0.28 });
    this.torso.ellipse(-5, -35, 5.5, 3.2).fill({ color: light, alpha: 0.7 });
    this.body.addChild(this.torso);

    // book (held in front of the torso while reading)
    this.book.roundRect(-11, -42, 22, 15, 2).fill(0xf6f1e7).stroke({ width: 1, color: 0xc9bfae });
    this.book.rect(-0.6, -42, 1.2, 15).fill(0xc9bfae);
    this.book.roundRect(-12, -43, 24, 17, 2).stroke({ width: 1.6, color: 0x7451f2 });
    this.book.visible = false;

    // arms: pivot at the shoulder; hand at the end; held items ride on the hand
    for (const [arm, x] of [
      [this.armL, -13],
      [this.armR, 13],
    ] as const) {
      arm.position.set(x, -37);
      const g = new Graphics();
      g.roundRect(-3, -1, 6, 15, 3).fill(limb);
      g.circle(0, 15, 3.9).fill(shade);
      g.circle(-1, 14, 1.4).fill({ color: 0xffffff, alpha: 0.3 });
      arm.addChild(g);
      this.body.addChild(arm);
    }
    this.mug.roundRect(-4, 11, 8, 9, 2).fill(0xffffff).stroke({ width: 1, color: 0xd6d0c4 });
    this.mug.roundRect(3.5, 13, 3, 4.5, 1.5).stroke({ width: 1.2, color: 0xd6d0c4 });
    this.mug.rect(-3, 12, 6, 2).fill(0x8a5a3c);
    this.mug.visible = false;
    this.armL.addChild(this.mug);
    this.drawProp();
    this.armR.addChild(this.prop);
    this.body.addChild(this.book);

    // head
    this.head.position.set(0, -42);
    const top = new Graphics();
    drawTop(top, look);
    const skull = new Graphics();
    skull.circle(0, -16, 18).fill(color);
    skull.ellipse(0, -6, 14, 6).fill({ color: shade, alpha: 0.22 });
    skull.ellipse(-7, -26, 6, 3.5).fill({ color: light, alpha: 0.75 });
    this.backHead.circle(0, -16, 18).fill(color);
    this.backHead.ellipse(0, -9, 15, 7).fill({ color: shade, alpha: 0.25 });
    this.backHead.ellipse(5, -26, 5, 3).fill({ color: light, alpha: 0.5 });
    this.backHead.visible = false;
    this.head.addChild(top, skull, this.backHead, this.face);

    for (const [eye, x] of [
      [this.eyeL, -6.5],
      [this.eyeR, 6.5],
    ] as const) {
      eye.position.set(x, -18);
      const white = new Graphics().ellipse(0, 0, 4.6, 5.4).fill(0xffffff);
      const pupil = new Graphics().circle(0, 0.4, 2.6).fill(INK).circle(1, -1, 0.9).fill(0xffffff);
      const star = new Graphics().star(0, 0, 4, 4.2, 1.6).fill(0xffc83d);
      star.visible = false;
      eye.addChild(white, pupil, star);
      this.pupils.push(pupil);
      this.stars.push(star);
      this.face.addChild(eye);
    }
    const cheeks = new Graphics();
    cheeks.ellipse(-11, -10, 3, 1.8).fill({ color: look.cheek, alpha: 0.75 });
    cheeks.ellipse(11, -10, 3, 1.8).fill({ color: look.cheek, alpha: 0.75 });
    this.face.addChild(cheeks);

    const mouth = (m: Mouth, draw: (g: Graphics) => void) => {
      const g = new Graphics();
      draw(g);
      g.visible = m === "smile";
      this.mouths.set(m, g);
      this.face.addChild(g);
    };
    mouth("smile", (g) => g.moveTo(-3.5, -8).quadraticCurveTo(0, -5, 3.5, -8).stroke({ width: 1.6, color: INK, cap: "round" }));
    mouth("grin", (g) => g.moveTo(-5, -8.5).quadraticCurveTo(0, -2, 5, -8.5).closePath().fill(INK).stroke({ width: 1.2, color: INK, join: "round" }));
    mouth("o", (g) => g.ellipse(0, -6.5, 2.4, 2.8).fill(INK));
    mouth("flat", (g) => g.moveTo(-3, -7).lineTo(3, -7).stroke({ width: 1.6, color: INK, cap: "round" }));
    mouth("frown", (g) => g.moveTo(-3.5, -5.5).quadraticCurveTo(0, -8.5, 3.5, -5.5).stroke({ width: 1.6, color: INK, cap: "round" }));
    mouth("sleep", (g) => g.circle(0, -6.5, 1.5).fill(INK));
    this.body.addChild(this.head);

    // bubble above the head
    this.bubbleText = new Text({
      text: "",
      style: { fontFamily: "DM Sans, system-ui, sans-serif", fontSize: 11, fill: INK, fontWeight: "500" },
      resolution: 2,
    });
    this.bubbleText.anchor.set(0.5);
    this.bubble.addChild(this.bubbleFx, this.bubbleBg, this.bubbleText);
    this.bubble.position.set(0, -86);
    this.bubble.visible = false;
    this.body.addChild(this.bubble);

    if (opts.label) {
      this.label = new Text({
        text: opts.label,
        style: { fontFamily: "Martian Mono, ui-monospace, monospace", fontSize: 9, fill: opts.labelColor ?? 0x5d5d5d, letterSpacing: 0.4 },
        resolution: 2,
      });
      this.label.anchor.set(0.5, 0);
      this.label.position.set(0, 9);
      this.root.addChild(this.label);
    }
  }

  setLabelColor(color: number) {
    if (this.label) this.label.style.fill = color;
  }

  setRing(color: number | null) {
    this.ring.clear();
    if (color === null) {
      this.ring.visible = false;
      return;
    }
    this.ring.ellipse(0, 0, 21, 7).stroke({ width: 2.5, color, alpha: 0.9 });
    this.ring.visible = true;
  }

  private drawProp() {
    const g = new Graphics();
    switch (this.look.prop) {
      case "tablet": // small tablet with a tiny bar chart
        g.roundRect(-7, 12, 14, 18, 2).fill(0x3b3550);
        g.roundRect(-5.5, 13.5, 11, 15, 1).fill(0xf4f2ff);
        [5, 8, 6, 11].forEach((h, i) => g.rect(-4 + i * 2.6, 27 - h, 1.8, h).fill(i === 3 ? 0x7451f2 : 0xb7aee0));
        break;
      case "megaphone":
        g.poly([-3, 14, 3, 14, 9, 28, -9, 28]).fill(0xff8a5c);
        g.ellipse(0, 28, 9, 2.5).fill(0xe0663a);
        g.roundRect(-2, 10, 4, 6, 1).fill(0x3b3550);
        break;
      case "magnifier":
        g.roundRect(-1.2, 15, 2.4, 9, 1).fill(0x6b4f3a);
        g.circle(0, 28, 6).fill({ color: 0xd6ecff, alpha: 0.85 }).stroke({ width: 2, color: 0x3b3550 });
        g.ellipse(-2, 26, 1.6, 1).fill({ color: 0xffffff, alpha: 0.9 });
        break;
      default: // laptop, held closed like a folder
        g.roundRect(-8, 11, 16, 12, 2).fill(0xb8b6c4);
        g.roundRect(-8, 11, 16, 2, 1).fill(0x8f8ca0);
        g.circle(0, 17, 1.3).fill(0xffffff);
    }
    this.prop.addChild(g);
    this.prop.visible = false;
  }

  /** Eases every part toward `pose`. Call once per frame. */
  apply(pose: Pose, dtMs: number, reduced = false) {
    const k = reduced ? 1 : 1 - Math.exp(-dtMs / 90);
    this.t += dtMs / 1000;
    const c = this.cur;
    for (const key of SMOOTH) c[key] += (pose[key] - c[key]) * k;
    c.mouth = pose.mouth;
    c.hold = pose.hold;
    c.sparkle = pose.sparkle;
    c.seated = pose.seated;
    c.away = pose.away;
    c.flip = pose.flip;

    this.body.y = c.bodyY + (c.seated ? 5 : 0);
    this.body.scale.y = c.squash;
    this.body.scale.x = (2 - c.squash) * c.flip; // squash keeps volume
    this.body.rotation = c.lean;
    // bubbles never read mirrored
    this.bubble.scale.x = c.flip / Math.max(0.5, 2 - c.squash);
    this.legL.rotation = c.legL;
    this.legR.rotation = c.legR;
    this.legL.scale.y = this.legR.scale.y = c.seated ? 0.72 : 1;
    this.armL.rotation = c.armL;
    this.armR.rotation = -c.armR;
    this.head.rotation = c.headTilt;
    this.head.x = c.lookX * 1.4;
    const open = Math.max(0.08, Math.min(1, c.eyeOpen));
    this.eyeL.scale.y = this.eyeR.scale.y = open;
    for (const p of this.pupils) p.position.set(c.lookX * 1.9, c.lookY * 1.6);
    for (let i = 0; i < 2; i++) {
      this.stars[i].visible = c.sparkle;
      this.pupils[i].visible = !c.sparkle;
      if (c.sparkle) this.stars[i].rotation = this.t * 3;
    }
    for (const [m, g] of this.mouths) g.visible = m === c.mouth;
    this.face.visible = !c.away;
    this.backHead.visible = c.away;
    this.prop.visible = c.hold === "prop";
    this.mug.visible = c.hold === "mug";
    this.book.visible = c.hold === "book" && !c.away;
    // the shadow shrinks while the character is up in the air
    const air = Math.max(0, -c.bodyY);
    this.shadow.scale.set(1 - Math.min(0.4, air / 40));
    this.shadow.alpha = 1 - Math.min(0.5, air / 30);
    this.animateBubble();
  }

  /** Shows a bubble. `text` is used by the "text" kind. Cheap to call every frame. */
  setBubble(kind: BubbleKind, text = "") {
    if (kind === this.bubbleKind && text === this.bubbleMsg) return;
    this.bubbleKind = kind;
    this.bubbleMsg = text;
    const bg = this.bubbleBg;
    bg.clear();
    this.bubbleFx.clear();
    this.bubble.visible = kind !== null;
    this.bubble.rotation = 0;
    this.bubbleText.rotation = 0;
    if (!kind) return;
    const card = (w: number, h: number, fill: number, stroke: number) => {
      bg.roundRect(-w / 2, -h / 2, w, h, 4).fill(fill).stroke({ width: 1, color: stroke });
      bg.poly([-4, h / 2 - 0.5, 4, h / 2 - 0.5, -6, h / 2 + 6]).fill(fill);
    };
    const t = this.bubbleText;
    t.style.fill = INK;
    t.style.fontSize = 11;
    t.y = 0;
    switch (kind) {
      case "text":
        t.text = text;
        card(Math.min(190, t.width + 16), 22, 0xffffff, 0xe0e0e0);
        break;
      case "dots":
        t.text = "";
        card(30, 18, 0xffffff, 0xe0e0e0);
        break;
      case "code":
        t.text = "</>";
        t.style.fill = 0x7451f2;
        card(32, 20, 0xffffff, 0xe0e0e0);
        break;
      case "think":
        t.text = "?";
        t.style.fontSize = 14;
        bg.circle(0, 0, 11).fill(0xffffff).stroke({ width: 1, color: 0xe0e0e0 });
        bg.circle(-8, 13, 3).fill(0xffffff).stroke({ width: 1, color: 0xe0e0e0 });
        bg.circle(-12, 19, 1.8).fill(0xffffff);
        break;
      case "gear":
        t.text = "";
        bg.circle(0, 0, 11).fill(0xffffff).stroke({ width: 1, color: 0xe0e0e0 });
        break;
      case "wait":
        t.text = "!";
        t.style.fill = 0xffffff;
        t.style.fontSize = 13;
        card(20, 20, 0x0072c6, 0x0072c6);
        break;
      case "error":
        t.text = "!";
        t.style.fill = 0xffffff;
        t.style.fontSize = 13;
        card(20, 20, 0xd2482a, 0xd2482a);
        break;
      case "pause":
        t.text = "II";
        t.style.fill = 0x5d5d5d;
        card(22, 20, 0xffffff, 0xe0e0e0);
        break;
      case "zzz":
      case "sparkle":
        t.text = "";
        break;
    }
  }

  private animateBubble() {
    if (!this.bubbleKind) return;
    const t = this.t;
    const fx = this.bubbleFx;
    switch (this.bubbleKind) {
      case "think":
        this.bubbleText.rotation = Math.sin(t * 3) * 0.35;
        break;
      case "gear": {
        fx.clear();
        fx.star(0, 0, 8, 7, 4.5, t * 2).fill(0x7451f2).circle(0, 0, 2.2).fill(0xffffff);
        break;
      }
      case "dots": {
        fx.clear();
        for (let i = 0; i < 3; i++) {
          const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 6 - i * 0.9));
          fx.circle(-7 + i * 7, 0, 2).fill({ color: 0x5d5d5d, alpha: a });
        }
        // dots draw on top of the card
        this.bubble.setChildIndex(fx, this.bubble.children.length - 1);
        break;
      }
      case "zzz": {
        fx.clear();
        this.bubbleText.text = "";
        for (let i = 0; i < 3; i++) {
          const p = (t * 0.5 + i / 3) % 1;
          const s = 3 + p * 4;
          const x = 4 + p * 14 + Math.sin(p * 6) * 2;
          const y = 4 - p * 26;
          fx.moveTo(x - s, y - s).lineTo(x + s, y - s).lineTo(x - s, y + s).lineTo(x + s, y + s).stroke({
            width: 1.6,
            color: 0x7451f2,
            alpha: 1 - p,
            cap: "round",
            join: "round",
          });
        }
        break;
      }
      case "sparkle": {
        fx.clear();
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + t * 1.5;
          const r = 22 + Math.sin(t * 5 + i) * 4;
          const s = 3 + Math.max(0, Math.sin(t * 7 + i * 2)) * 3;
          fx.star(Math.cos(a) * r, 20 + Math.sin(a) * r * 0.6, 4, s, s * 0.4).fill(i % 2 ? 0xffc83d : 0x7451f2);
        }
        break;
      }
      case "error": {
        fx.clear();
        // a small grey cloud drifting above
        const dx = Math.sin(t * 0.8) * 3;
        fx.ellipse(-14 + dx, -14, 7, 5).ellipse(-6 + dx, -17, 8, 6).ellipse(2 + dx, -14, 7, 5).fill({ color: 0x8c8794, alpha: 0.85 });
        break;
      }
      case "wait":
        this.bubble.y = -86 + Math.sin(t * 4) * 1.5;
        break;
    }
  }

  destroy() {
    this.root.destroy({ children: true });
  }
}

function drawTop(g: Graphics, look: Look) {
  const { color, shade, cheek } = look;
  switch (look.variant) {
    case "ears":
      g.circle(-13, -30, 6).fill(color).circle(13, -30, 6).fill(color);
      g.circle(-13, -30, 3).fill({ color: cheek, alpha: 0.6 }).circle(13, -30, 3).fill({ color: cheek, alpha: 0.6 });
      break;
    case "antenna":
      g.moveTo(0, -33).quadraticCurveTo(3, -38, 0, -42).stroke({ width: 2, color: shade, cap: "round" });
      g.circle(0, -43, 3.4).fill(cheek);
      break;
    case "sprout":
      g.moveTo(0, -33).lineTo(0, -38).stroke({ width: 2, color: 0x4f9d5d, cap: "round" });
      g.ellipse(-4, -39, 4.5, 2.4).fill(0x5fbf73);
      g.ellipse(4, -40, 4.5, 2.4).fill(0x6fd184);
      break;
    case "horns":
      g.poly([-12, -28, -15, -37, -8, -32]).fill(shade).poly([12, -28, 15, -37, 8, -32]).fill(shade);
      break;
    default:
      g.ellipse(-3, -34, 3, 5).fill(shade).ellipse(3, -35, 3, 5.5).fill(mix(shade, color, 0.3));
  }
}

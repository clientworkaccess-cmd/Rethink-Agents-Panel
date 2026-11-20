// The layered vector character for Pixi scenes (Office, Chat lobby, Dashboard team strip).
// Every part (legs, feet, body, arms, hands, head, eyes, brows, mouth, prop, emblem) is its own display
// object, so animation is procedural on the parts: the rig eases each part toward the Pose the brain asks for.
// The art comes from art.ts (shared with the SVG avatar); original drawing, no image assets.
import { Container, Graphics, GraphicsPath, Text } from "pixi.js";
import { sceneChrome, type SceneChrome } from "@/lib/tokens";
import {
  artFor,
  BROW_EXPR,
  BROW_L,
  BROW_R,
  EYE,
  EYE_L,
  EYE_R,
  HAND,
  HIP_L,
  HIP_R,
  MOUTHS,
  NECK,
  SHOULDER_L,
  SHOULDER_R,
  STAR_EYE,
  type Mouth,
  type Shape,
} from "./art";
import type { Look } from "./model";

export type { Mouth };
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
  /** The role emblem floats above the left hand (palm up). */
  emblem: boolean;
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
  emblem: false,
  seated: false,
  flip: 1,
  away: false,
};

const SMOOTH = ["armL", "armR", "legL", "legR", "bodyY", "squash", "lean", "headTilt", "lookX", "lookY", "eyeOpen"] as const;
const BUBBLE_Y = -92;

/** Draws art.ts shapes into a Pixi Graphics. */
export function drawShapes(g: Graphics, shapes: Shape[]) {
  for (const sh of shapes) {
    g.path(new GraphicsPath(sh.d));
    if (sh.fill !== undefined) g.fill({ color: sh.fill, alpha: sh.alpha ?? 1 });
    if (sh.line) g.stroke({ width: sh.line, color: sh.stroke ?? 0, cap: "round", join: "round" });
  }
  return g;
}
const gfx = (shapes: Shape[]) => drawShapes(new Graphics(), shapes);

export class CharacterRig {
  readonly root = new Container();
  /** Everything above the shadow; bounces and jumps. */
  private body = new Container();
  private shadow = new Graphics();
  private ring = new Graphics();
  private legL = new Container();
  private legR = new Container();
  private torso: Graphics;
  private torsoBack: Graphics;
  private armL = new Container();
  private armR = new Container();
  private head = new Container();
  private face = new Container();
  private front = new Container();
  private backHead: Graphics;
  private eyeL = new Container();
  private eyeR = new Container();
  private pupils: Graphics[] = [];
  private stars: Graphics[] = [];
  private browL = new Container();
  private browR = new Container();
  private mouths = new Map<Mouth, Graphics>();
  private prop = new Container();
  private emblem = new Container();
  private emblemArt = new Container();
  private emblemGlow = new Graphics();
  private emblemK = 0;
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
  /** Bubble and label colours/fonts from the design tokens (re-read by refreshChrome on theme change). */
  private chrome: SceneChrome = sceneChrome();

  constructor(
    private look: Look,
    opts: { label?: string; labelColor?: number; ring?: number | null } = {},
  ) {
    const art = artFor(look);
    this.root.sortableChildren = false;

    this.ring.visible = false;
    if (opts.ring != null) this.setRing(opts.ring);
    this.shadow.ellipse(0, 1, 14, 4).fill({ color: 0x000000, alpha: 0.16 });
    this.root.addChild(this.ring, this.shadow, this.body);

    // legs: pivot at the hip, shoe at the end
    this.legL.position.set(HIP_L.x, HIP_L.y);
    this.legR.position.set(HIP_R.x, HIP_R.y);
    this.legL.addChild(gfx(art.legL));
    this.legR.addChild(gfx(art.legR));
    this.body.addChild(this.legL, this.legR);

    // torso (front and back view)
    this.torso = gfx(art.torso);
    this.torsoBack = gfx(art.torsoBack);
    this.torsoBack.visible = false;
    this.body.addChild(this.torsoBack, this.torso);

    // book (held in front of the torso while reading)
    this.book.roundRect(-11, -36, 22, 15, 2).fill(0xf6f1e7).stroke({ width: 1.2, color: 0x2a2230 });
    this.book.rect(-0.6, -36, 1.2, 15).fill(0xc9bfae);
    this.book.roundRect(-12, -37, 24, 17, 2).stroke({ width: 1.6, color: 0x7451f2 });
    this.book.visible = false;

    // arms: pivot at the shoulder; hand at the end; held items ride on the hand
    this.armL.position.set(SHOULDER_L.x, SHOULDER_L.y);
    this.armR.position.set(SHOULDER_R.x, SHOULDER_R.y);
    this.mug.roundRect(-4, 9, 8, 9, 2).fill(0xffffff).stroke({ width: 1.1, color: 0x2a2230 });
    this.mug.roundRect(3.5, 11, 3, 4.5, 1.5).stroke({ width: 1.1, color: 0x2a2230 });
    this.mug.rect(-3, 10, 6, 2).fill(0x8a5a3c);
    this.mug.visible = false;
    this.armL.addChild(gfx(art.arm), this.mug);
    this.prop.position.set(HAND.x, HAND.y);
    this.prop.addChild(gfx(art.prop));
    this.prop.visible = false;
    this.armR.addChild(gfx(art.arm), this.prop);
    this.body.addChild(this.armL, this.armR, this.book);

    // head: back hair, ears, skull, face, front hair, accessories; a separate back view
    this.head.position.set(NECK.x, NECK.y);
    this.backHead = gfx(art.backHead);
    this.backHead.visible = false;
    this.front.addChild(gfx(art.hairBack), gfx(art.ears), gfx(art.skull), gfx(art.face));
    for (const [eye, p] of [
      [this.eyeL, EYE_L],
      [this.eyeR, EYE_R],
    ] as const) {
      eye.position.set(p.x, p.y);
      const pupil = gfx(EYE);
      const starEye = gfx(STAR_EYE);
      starEye.visible = false;
      eye.addChild(pupil, starEye);
      this.pupils.push(pupil);
      this.stars.push(starEye);
      this.face.addChild(eye);
    }
    this.browL.position.set(BROW_L.x, BROW_L.y);
    this.browR.position.set(BROW_R.x, BROW_R.y);
    this.browL.addChild(gfx(art.browL));
    this.browR.addChild(gfx(art.browR));
    this.face.addChild(this.browL, this.browR);
    for (const m of Object.keys(MOUTHS) as Mouth[]) {
      const g = gfx(MOUTHS[m]);
      g.visible = m === "smile";
      this.mouths.set(m, g);
      this.face.addChild(g);
    }
    this.front.addChild(this.face, gfx(art.hairFront), gfx(art.accessory));
    this.head.addChild(this.front, this.backHead);
    this.body.addChild(this.head);

    // the role emblem, floating above the left hand (drawn upright, never mirrored)
    for (let r = 15; r > 4; r -= 3.5) this.emblemGlow.circle(0, 0, r).fill({ color: 0xffd27a, alpha: 0.07 });
    this.emblemArt.addChild(gfx(art.emblem));
    this.emblem.addChild(this.emblemGlow, this.emblemArt);
    this.emblem.visible = false;
    this.body.addChild(this.emblem);

    // bubble above the head
    this.bubbleText = new Text({
      text: "",
      style: { fontFamily: this.chrome.fontSans, fontSize: 11, fill: this.chrome.bubbleFg, fontWeight: "400" },
      resolution: 2,
    });
    this.bubbleText.anchor.set(0.5);
    this.bubble.addChild(this.bubbleFx, this.bubbleBg, this.bubbleText);
    this.bubble.position.set(0, BUBBLE_Y);
    this.bubble.visible = false;
    this.body.addChild(this.bubble);

    if (opts.label) {
      this.label = new Text({
        text: opts.label,
        style: { fontFamily: this.chrome.fontMono, fontSize: 9, fill: opts.labelColor ?? this.chrome.label, letterSpacing: 0.4 },
        resolution: 2,
      });
      this.label.anchor.set(0.5, 0);
      this.label.position.set(0, 7);
      this.root.addChild(this.label);
    }
  }

  setLabelColor(color: number) {
    if (this.label) this.label.style.fill = color;
  }

  /** Shows or hides the name under the feet (the Office hides it while the agent sits at its labelled desk). */
  setLabelVisible(on: boolean) {
    if (this.label) this.label.visible = on;
  }

  /** Re-reads the token colours for the chrome around the art (label, bubble) and redraws the bubble. */
  refreshChrome() {
    this.chrome = sceneChrome();
    if (this.label) {
      this.label.style.fill = this.chrome.label;
      this.label.style.fontFamily = this.chrome.fontMono;
    }
    this.bubbleText.style.fontFamily = this.chrome.fontSans;
    const kind = this.bubbleKind;
    const msg = this.bubbleMsg;
    this.bubbleKind = null;
    this.bubbleMsg = "";
    this.setBubble(kind, msg);
  }

  setRing(color: number | null) {
    this.ring.clear();
    if (color === null) {
      this.ring.visible = false;
      return;
    }
    this.ring.ellipse(0, 1, 20, 6.5).stroke({ width: 2.5, color, alpha: 0.9 });
    this.ring.visible = true;
  }

  /** Eases every part toward `pose`. Call once per frame. */
  apply(pose: Pose, dtMs: number, reduced = false) {
    const k = reduced ? 1 : 1 - Math.exp(-dtMs / 90);
    this.t += dtMs / 1000;
    const c = this.cur;
    for (const key of SMOOTH) c[key] += (pose[key] - c[key]) * k;
    c.mouth = pose.mouth;
    c.hold = pose.hold;
    c.emblem = pose.emblem;
    c.sparkle = pose.sparkle;
    c.seated = pose.seated;
    c.away = pose.away;
    c.flip = pose.flip;

    this.body.y = c.bodyY + (c.seated ? 5 : 0);
    this.body.scale.y = c.squash;
    this.body.scale.x = (2 - c.squash) * c.flip; // squash keeps volume
    this.body.rotation = c.lean;
    // bubbles and emblems never read mirrored
    const unflip = c.flip / Math.max(0.5, 2 - c.squash);
    this.bubble.scale.x = unflip;
    this.legL.rotation = c.legL;
    this.legR.rotation = c.legR;
    this.legL.scale.y = this.legR.scale.y = c.seated ? 0.72 : 1;
    this.armL.rotation = c.armL;
    this.armR.rotation = -c.armR;
    this.head.rotation = c.headTilt;
    this.head.x = NECK.x + c.lookX * 1.2;
    const open = Math.max(0.1, Math.min(1, c.eyeOpen));
    this.eyeL.scale.y = this.eyeR.scale.y = open;
    this.eyeL.position.set(EYE_L.x + c.lookX * 1.5, EYE_L.y + c.lookY * 1.2);
    this.eyeR.position.set(EYE_R.x + c.lookX * 1.5, EYE_R.y + c.lookY * 1.2);
    for (let i = 0; i < 2; i++) {
      this.stars[i].visible = c.sparkle;
      this.pupils[i].visible = !c.sparkle;
      if (c.sparkle) this.stars[i].rotation = this.t * 3;
    }
    // brows follow the mouth so the whole face reads as one expression
    const [by, bt] = BROW_EXPR[c.mouth];
    this.browL.position.set(BROW_L.x + c.lookX * 1.1, BROW_L.y + by + c.lookY * 0.5);
    this.browR.position.set(BROW_R.x + c.lookX * 1.1, BROW_R.y + by + c.lookY * 0.5);
    this.browL.rotation = bt;
    this.browR.rotation = -bt;
    for (const [m, g] of this.mouths) g.visible = m === c.mouth;
    this.front.visible = !c.away;
    this.backHead.visible = c.away;
    this.torso.visible = !c.away;
    this.torsoBack.visible = c.away;
    this.prop.visible = c.hold === "prop";
    // a briefcase hangs from the hand whatever the arm does
    if (this.look.prop === "briefcase") this.prop.rotation = c.armR - Math.max(0, c.armR - 1.2) * 0.4;
    this.mug.visible = c.hold === "mug";
    this.book.visible = c.hold === "book" && !c.away;

    // emblem: fades in above the left hand and bobs gently
    this.emblemK += ((c.emblem && !c.away ? 1 : 0) - this.emblemK) * (reduced ? 1 : Math.min(1, dtMs / 140));
    this.emblem.visible = this.emblemK > 0.02;
    if (this.emblem.visible) {
      const a = c.armL;
      const hx = SHOULDER_L.x - Math.sin(a) * HAND.y;
      const hy = SHOULDER_L.y + Math.cos(a) * HAND.y;
      const bob = reduced ? 0 : Math.sin(this.t * 2.4) * 1.6;
      this.emblem.position.set(hx - 2, hy - 15 + bob - (1 - this.emblemK) * 6);
      this.emblem.alpha = this.emblemK;
      this.emblem.scale.set(unflip * (0.7 + 0.3 * this.emblemK), 0.7 + 0.3 * this.emblemK);
      this.emblem.rotation = -c.lean;
      this.emblemArt.rotation = reduced ? 0 : Math.sin(this.t * 1.7) * 0.08;
      this.emblemGlow.alpha = 0.7 + Math.sin(this.t * 3) * 0.3;
    }

    // the shadow shrinks while the character is up in the air
    const air = Math.max(0, -c.bodyY);
    this.shadow.scale.set(1 - Math.min(0.4, air / 40));
    this.shadow.alpha = 1 - Math.min(0.5, air / 30);
    this.animateBubble();
  }

  /** Shows a bubble. `text` is used by the "text" kind. Cheap to call every frame. */
  setBubble(kind: BubbleKind, text = "") {
    if (kind === this.bubbleKind && text === this.bubbleMsg) return;
    const c = this.chrome;
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
    t.style.fill = c.bubbleFg;
    t.style.fontSize = 11;
    t.y = 0;
    switch (kind) {
      case "text":
        t.text = text;
        card(Math.min(190, t.width + 16), 22, c.bubbleBg, c.bubbleBorder);
        break;
      case "dots":
        t.text = "";
        card(30, 18, c.bubbleBg, c.bubbleBorder);
        break;
      case "code":
        t.text = "</>";
        t.style.fill = c.code;
        card(32, 20, c.bubbleBg, c.bubbleBorder);
        break;
      case "think":
        t.text = "?";
        t.style.fontSize = 14;
        bg.circle(0, 0, 11).fill(c.bubbleBg).stroke({ width: 1, color: c.bubbleBorder });
        bg.circle(-8, 13, 3).fill(c.bubbleBg).stroke({ width: 1, color: c.bubbleBorder });
        bg.circle(-12, 19, 1.8).fill(c.bubbleBg);
        break;
      case "gear":
        t.text = "";
        bg.circle(0, 0, 11).fill(c.bubbleBg).stroke({ width: 1, color: c.bubbleBorder });
        break;
      case "wait":
        t.text = "!";
        t.style.fill = c.onStatus;
        t.style.fontSize = 13;
        card(20, 20, c.waiting, c.waiting);
        break;
      case "error":
        t.text = "!";
        t.style.fill = c.onStatus;
        t.style.fontSize = 13;
        card(20, 20, c.error, c.error);
        break;
      case "pause":
        t.text = "II";
        t.style.fill = c.paused;
        card(22, 20, c.bubbleBg, c.bubbleBorder);
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
        fx.star(0, 0, 8, 7, 4.5, t * 2).fill(this.chrome.code).circle(0, 0, 2.2).fill(this.chrome.bubbleBg);
        break;
      }
      case "dots": {
        fx.clear();
        for (let i = 0; i < 3; i++) {
          const a = 0.35 + 0.65 * Math.max(0, Math.sin(t * 6 - i * 0.9));
          fx.circle(-7 + i * 7, 0, 2).fill({ color: this.chrome.label, alpha: a });
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
            color: this.chrome.label,
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
        this.bubble.y = BUBBLE_Y + Math.sin(t * 4) * 1.5;
        break;
    }
  }

  destroy() {
    this.root.destroy({ children: true });
  }
}

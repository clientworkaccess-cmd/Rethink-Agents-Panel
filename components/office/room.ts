// The office room, drawn with Pixi Graphics (original art). A cosy 3/4 "diorama" view: back wall with
// the chart wall, window, clock, whiteboard and campaign board; desks; coffee corner; plants; rug and a
// meeting table. Ambient life: monitor glow flicker, real-time wall clock, swaying plants, window that
// follows the time of day. Dark theme = night: darker room, lamp and monitor glow, stars in the window.
import { Container, Graphics } from "pixi.js";
import { mix } from "@/components/character/model";
import { DESK, W, WALL_H, type Layout } from "./world";

type Palette = {
  wall: number;
  wallDot: number;
  floor: number;
  plank: number;
  base: number;
  deskTop: number;
  deskEdge: number;
  deskLeg: number;
  monitor: number;
  screen: number;
  paper: number;
  ink: number;
  rug: number;
  wood: number;
  woodEdge: number;
  leaf: number[];
  pot: number;
  night: boolean;
};

const LIGHT: Palette = {
  wall: 0xfbfaff,
  wallDot: 0xe6e2f2,
  floor: 0xf1ebe2,
  plank: 0xe4dbcf,
  base: 0xe2dcef,
  deskTop: 0xffffff,
  deskEdge: 0xe0e0e0,
  deskLeg: 0xc9c4d6,
  monitor: 0x3a3450,
  screen: 0xd9d0ff,
  paper: 0xffffff,
  ink: 0x272727,
  rug: 0xece6ff,
  wood: 0xe8d3b5,
  woodEdge: 0xcfb48f,
  leaf: [0x7cc58f, 0x5fae78, 0x8fd3a0],
  pot: 0xe9a58a,
  night: false,
};

const DARK: Palette = {
  wall: 0x1f1b2b,
  wallDot: 0x2c2740,
  floor: 0x29232f,
  plank: 0x231e29,
  base: 0x332c44,
  deskTop: 0x3a3449,
  deskEdge: 0x2c2739,
  deskLeg: 0x4a4360,
  monitor: 0x15121d,
  screen: 0x9d85ff,
  paper: 0xd9d4e6,
  ink: 0xe9e6f2,
  rug: 0x2c2545,
  wood: 0x5a4a3b,
  woodEdge: 0x463a2e,
  leaf: [0x4f8f62, 0x3f7a52, 0x5f9f70],
  pot: 0x9c6b5a,
  night: true,
};

export type Room = {
  /** Background layer (wall, floor, rug): below every character. */
  back: Container;
  /** Depth-sorted props (desks, plants, counter, table) to put in the same sorted layer as characters. */
  props: Container[];
  /** Per-frame ambient animation. */
  update: (tSec: number, reduced: boolean) => void;
  destroy: () => void;
};

export function buildRoom(layout: Layout, chairColors: number[], dark: boolean): Room {
  const P = dark ? DARK : LIGHT;
  const H = layout.height;
  const back = new Container();
  const props: Container[] = [];

  // ---------- wall and floor ----------
  const bg = new Graphics();
  bg.rect(0, WALL_H, W, H - WALL_H).fill(P.floor);
  for (let y = WALL_H + 34; y < H; y += 34) bg.rect(0, y, W, 1.2).fill(P.plank);
  for (let y = WALL_H; y < H; y += 34)
    for (let x = ((y / 34) % 2) * 90; x < W; x += 180) bg.rect(x, y, 1.2, 34).fill(P.plank);
  bg.rect(0, 0, W, WALL_H).fill(P.wall);
  for (let y = 12; y < WALL_H - 10; y += 16) for (let x = 12; x < W; x += 16) bg.circle(x, y, 0.9).fill(P.wallDot);
  bg.rect(0, WALL_H - 8, W, 8).fill(P.base);
  // side wall returns: give the box its diorama depth
  bg.poly([0, 0, 26, 18, 26, WALL_H + 6, 0, WALL_H + 30]).fill(mix(P.wall, 0x000000, 0.06));
  bg.poly([W, 0, W - 26, 18, W - 26, WALL_H + 6, W, WALL_H + 30]).fill(mix(P.wall, 0x000000, 0.06));
  bg.rect(0, H - 6, W, 6).fill(P.base);

  // rug + meeting table shadow area
  const tx = W / 2;
  const ty = layout.tableY;
  bg.roundRect(tx - 200, ty - 62, 400, 124, 4).fill(P.rug);
  bg.roundRect(tx - 188, ty - 50, 376, 100, 4).stroke({ width: 1.5, color: mix(P.rug, 0x7451f2, 0.25) });

  // ---------- wall items ----------
  // chart wall
  bg.roundRect(70, 22, 200, 92, 4).fill(P.paper).stroke({ width: 1.5, color: P.deskEdge });
  const bars = [30, 44, 36, 52, 62];
  bars.forEach((h, i) => bg.roundRect(88 + i * 22, 104 - h, 14, h, 2).fill(i === bars.length - 1 ? 0x7451f2 : mix(0x7451f2, P.paper, 0.7)));
  bg.moveTo(206, 92).lineTo(222, 76).lineTo(236, 82).lineTo(254, 50).stroke({ width: 2, color: P.ink, alpha: 0.6, cap: "round", join: "round" });
  bg.circle(254, 50, 3.5).fill(0xff9fc6);

  // window (sky drawn separately, it changes with time)
  const winX = 300;
  const winY = 26;
  const winW = 110;
  const winH = 84;
  const sky = new Graphics();
  const frame = new Graphics();
  frame.roundRect(winX - 4, winY - 4, winW + 8, winH + 8, 4).stroke({ width: 6, color: P.base });
  frame.rect(winX + winW / 2 - 1.5, winY, 3, winH).fill(P.base);
  frame.rect(winX, winY + winH / 2 - 1.5, winW, 3).fill(P.base);
  frame.roundRect(winX - 8, winY + winH + 2, winW + 16, 6, 2).fill(P.base);

  // clock (hands updated every frame)
  const clockFace = new Graphics();
  clockFace.circle(450, 54, 20).fill(P.paper).stroke({ width: 3, color: P.ink, alpha: 0.75 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    clockFace.circle(450 + Math.cos(a) * 15, 54 + Math.sin(a) * 15, i % 3 ? 0.9 : 1.6).fill(P.ink);
  }
  const hands = new Graphics();

  // whiteboard
  bg.roundRect(490, 24, 180, 84, 4).fill(P.paper).stroke({ width: 3, color: P.deskLeg });
  bg.moveTo(508, 46).lineTo(590, 46).stroke({ width: 2, color: P.ink, alpha: 0.45, cap: "round" });
  bg.moveTo(508, 62).lineTo(640, 62).stroke({ width: 2, color: P.ink, alpha: 0.3, cap: "round" });
  bg.moveTo(508, 78).lineTo(600, 78).stroke({ width: 2, color: 0x7451f2, alpha: 0.6, cap: "round" });
  bg.circle(640, 80, 9).stroke({ width: 2, color: 0xff9fc6 });
  bg.roundRect(540, 108, 80, 4, 2).fill(P.deskLeg);

  // campaign board (cork)
  bg.roundRect(712, 22, 176, 92, 4).fill(dark ? 0x6b5640 : 0xe3c9a3).stroke({ width: 1.5, color: dark ? 0x56442f : 0xcfb18a });
  [
    [728, 34, 44, 40, 0xffd166],
    [780, 30, 48, 34, 0xffffff],
    [838, 38, 40, 50, 0x8cc4ff],
  ].forEach(([x, y, w, h, c], i) => {
    bg.rect(x, y, w, h).fill(dark ? mix(c, 0x000000, 0.35) : c);
    bg.rect(x + 6, y + 9, w - 12, 3).fill({ color: 0x272727, alpha: 0.22 });
    bg.rect(x + 6, y + 16, w - 20, 3).fill({ color: 0x272727, alpha: 0.14 });
    bg.circle(x + w / 2, y + 3, 2.6).fill(i === 1 ? 0x7451f2 : 0xff7a59);
  });

  // shelf above the coffee corner
  bg.roundRect(930, 50, 90, 6, 2).fill(P.woodEdge);
  [0xff9fc6, 0x8cc4ff, 0xffd166, 0x86d9a6].forEach((c, i) => bg.roundRect(936 + i * 14, 30, 10, 20, 2).fill(c));

  back.addChild(bg, sky, frame, clockFace, hands);

  // night lamps on the wall (dark theme)
  const glow = new Graphics();
  if (P.night) {
    for (const x of [200, 610, 900]) {
      glow.circle(x, 14, 70).fill({ color: 0xffd27a, alpha: 0.05 });
      glow.circle(x, 14, 36).fill({ color: 0xffd27a, alpha: 0.07 });
      glow.roundRect(x - 10, 4, 20, 8, 3).fill(0xffe2a8);
    }
    back.addChild(glow);
  }

  // ---------- coffee corner ----------
  const coffee = new Container();
  const cg = new Graphics();
  cg.roundRect(950, WALL_H - 6, 86, 58, 4).fill(P.deskTop).stroke({ width: 1.5, color: P.deskEdge });
  cg.rect(950, WALL_H + 8, 86, 2).fill(P.deskEdge);
  cg.roundRect(962, WALL_H - 34, 30, 34, 4).fill(dark ? 0x4a4360 : 0x3a3450);
  cg.roundRect(968, WALL_H - 28, 18, 8, 2).fill(0x7451f2);
  cg.roundRect(970, WALL_H - 12, 14, 9, 2).fill(0xffffff);
  cg.roundRect(1002, WALL_H - 14, 10, 12, 3).fill(0xffd166);
  cg.roundRect(1016, WALL_H - 12, 10, 10, 3).fill(0xff9fc6);
  coffee.addChild(cg);
  const steam = new Graphics();
  coffee.addChild(steam);
  coffee.zIndex = WALL_H + 60;
  props.push(coffee);

  // ---------- plants (sway) ----------
  const plants: Container[] = [];
  const plant = (x: number, y: number, s: number) => {
    const c = new Container();
    c.position.set(x, y);
    const pot = new Graphics();
    pot.ellipse(0, 12 * s, 16 * s, 4.5 * s).fill({ color: 0x000000, alpha: 0.1 });
    pot.roundRect(-12 * s, -6 * s, 24 * s, 18 * s, 4 * s).fill(P.pot);
    pot.roundRect(-13 * s, -8 * s, 26 * s, 5 * s, 2 * s).fill(mix(P.pot, 0x000000, 0.1));
    const leaves = new Container();
    leaves.position.set(0, -6 * s);
    const lg = new Graphics();
    [
      [-9, -12, 10, 0],
      [8, -14, 11, 1],
      [0, -26, 11, 2],
      [-3, -6, 8, 1],
      [6, -24, 7, 0],
    ].forEach(([dx, dy, r, i]) => lg.circle(dx * s, dy * s, r * s).fill(P.leaf[i]));
    leaves.addChild(lg);
    c.addChild(pot, leaves);
    c.zIndex = y + 12 * s;
    plants.push(leaves);
    props.push(c);
  };
  plant(38, WALL_H + 30, 1);
  plant(40, H - 34, 1.25);
  plant(W - 40, H - 34, 1.25);

  // ---------- desks ----------
  const glows: Graphics[] = [];
  layout.seats.forEach((s, i) => {
    const chair = new Container();
    const ch = new Graphics();
    const color = chairColors[i] ?? (dark ? 0x4a4360 : 0xd8d2e8);
    ch.roundRect(-15, -52, 30, 30, 8).fill(mix(color, dark ? 0x000000 : 0xffffff, dark ? 0.35 : 0.35));
    ch.roundRect(-15, -52, 30, 6, 3).fill({ color: 0xffffff, alpha: dark ? 0.08 : 0.35 });
    ch.rect(-2, -22, 4, 14).fill(P.deskLeg);
    // monitor at the back-left of the desk, screen turned toward the seat
    ch.roundRect(-50, -40, 30, 22, 3).fill(P.monitor);
    ch.roundRect(-47, -37, 24, 16, 2).fill(P.screen);
    ch.rect(-37, -18, 4, 8).fill(P.monitor);
    chair.addChild(ch);
    const glow = new Graphics();
    glow.circle(-35, -29, P.night ? 30 : 18).fill({ color: P.night ? 0x9d85ff : 0xbfb0ff, alpha: P.night ? 0.16 : 0.1 });
    chair.addChild(glow);
    glows.push(glow);
    chair.position.set(s.x, s.y);
    chair.zIndex = s.y - 1;
    props.push(chair);

    const desk = new Container();
    const d = new Graphics();
    const hw = DESK.halfW;
    // top surface seen from above, front slab, thin legs (open front: dangling feet stay visible)
    d.roundRect(-hw, -44, hw * 2, 14, 3).fill(P.deskTop).stroke({ width: 1, color: P.deskEdge });
    d.rect(-hw, -30, hw * 2, 5).fill(mix(P.deskTop, 0x000000, dark ? 0.15 : 0.06));
    d.rect(-hw + 4, -25, 4, 38).fill(P.deskLeg);
    d.rect(hw - 8, -25, 4, 38).fill(P.deskLeg);
    d.ellipse(0, 14, hw, 4).fill({ color: 0x000000, alpha: 0.07 });
    // mug and papers on the desk
    d.roundRect(36, -50, 10, 11, 3).fill(0xffffff).stroke({ width: 1, color: 0xd6d0c4 });
    d.rect(37, -48, 8, 2).fill(0x8a5a3c);
    d.rect(-56, -42, 16, 9).fill(P.paper).stroke({ width: 0.8, color: P.deskEdge });
    d.rect(-53, -39, 9, 1.5).fill({ color: 0x272727, alpha: 0.2 });
    desk.addChild(d);
    if (P.night) {
      const lamp = new Graphics();
      lamp.circle(52, -58, 26).fill({ color: 0xffd27a, alpha: 0.1 });
      lamp.rect(50, -62, 2, 14).fill(P.deskLeg);
      lamp.roundRect(44, -68, 14, 7, 3).fill(0xffe2a8);
      desk.addChild(lamp);
    }
    desk.position.set(s.x, s.y + 20);
    desk.zIndex = s.y + 20;
    props.push(desk);
  });

  // ---------- meeting table ----------
  const table = new Container();
  const tg = new Graphics();
  for (const [cx, cy] of [
    [-90, -36],
    [0, -44],
    [90, -36],
  ])
    tg.roundRect(cx - 14, cy - 12, 28, 22, 6).fill(mix(0x7451f2, P.floor, dark ? 0.55 : 0.75));
  tg.ellipse(0, 6, 130, 34).fill(P.woodEdge);
  tg.ellipse(0, 0, 130, 34).fill(P.wood);
  tg.ellipse(-30, -8, 40, 10).fill({ color: 0xffffff, alpha: dark ? 0.04 : 0.18 });
  tg.roundRect(-20, -12, 24, 16, 2).fill(P.paper);
  tg.roundRect(30, -6, 10, 11, 3).fill(0xffffff);
  table.addChild(tg);
  table.position.set(tx, ty);
  table.zIndex = ty;
  props.push(table);
  const frontChairs = new Container();
  const fg = new Graphics();
  for (const cx of [-90, 0, 90]) fg.roundRect(cx - 14, 30, 28, 18, 6).fill(mix(0x7451f2, P.floor, dark ? 0.45 : 0.65));
  frontChairs.addChild(fg);
  frontChairs.position.set(tx, ty);
  frontChairs.zIndex = ty + 40;
  props.push(frontChairs);

  // ---------- ambient ----------
  let lastSkyKey = "";
  const drawSky = () => {
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    const night = P.night || h < 6.5 || h >= 19.5;
    const dusk = !night && (h >= 18 || h < 7.5);
    const key = `${night}-${dusk}-${now.getMinutes() >> 3}`;
    if (key === lastSkyKey) return;
    lastSkyKey = key;
    sky.clear();
    sky.rect(winX, winY, winW, winH).fill(night ? 0x1d2346 : dusk ? 0xffc9a8 : 0xcfe6ff);
    if (night) {
      for (let i = 0; i < 14; i++) {
        const sx = winX + 6 + ((i * 37) % (winW - 12));
        const sy = winY + 6 + ((i * 23) % (winH - 12));
        sky.circle(sx, sy, i % 4 ? 0.9 : 1.5).fill({ color: 0xffffff, alpha: 0.85 });
      }
      sky.circle(winX + 80, winY + 22, 9).fill(0xfff4cf);
      sky.circle(winX + 84, winY + 19, 8).fill(0x1d2346);
    } else {
      // the sun moves across the window during the day
      const k = Math.min(1, Math.max(0, (h - 7) / 12));
      sky.circle(winX + 14 + k * (winW - 28), winY + 30 - Math.sin(k * Math.PI) * 14, 9).fill(dusk ? 0xff9a5a : 0xffd166);
      sky.ellipse(winX + 30, winY + 60, 18, 7).fill({ color: 0xffffff, alpha: 0.9 });
      sky.ellipse(winX + 44, winY + 55, 12, 7).fill({ color: 0xffffff, alpha: 0.9 });
    }
  };
  drawSky();

  const update = (t: number, reduced: boolean) => {
    // real-time clock
    const now = new Date();
    const sec = now.getSeconds() + now.getMilliseconds() / 1000;
    const min = now.getMinutes() + sec / 60;
    const hr = (now.getHours() % 12) + min / 60;
    hands.clear();
    const hand = (a: number, len: number, w: number, color: number) =>
      hands
        .moveTo(450, 54)
        .lineTo(450 + Math.sin(a) * len, 54 - Math.cos(a) * len)
        .stroke({ width: w, color, cap: "round" });
    hand((hr / 12) * Math.PI * 2, 9, 2.4, P.ink);
    hand((min / 60) * Math.PI * 2, 13, 1.8, P.ink);
    hand((Math.floor(sec) / 60) * Math.PI * 2, 14, 1, 0x7451f2);
    hands.circle(450, 54, 1.8).fill(0x7451f2);
    if (Math.floor(t) % 10 === 0) drawSky();
    if (reduced) return;
    for (let i = 0; i < plants.length; i++) plants[i].rotation = Math.sin(t * 0.9 + i * 1.7) * 0.035;
    for (let i = 0; i < glows.length; i++) glows[i].alpha = 0.85 + Math.sin(t * 7 + i * 3) * 0.08 + (Math.sin(t * 23 + i) > 0.97 ? -0.3 : 0);
    steam.clear();
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.4 + i / 3) % 1;
      steam.circle(977 + Math.sin(p * 6 + i) * 3, WALL_H - 38 - p * 22, 2 + p * 3).fill({ color: dark ? 0xffffff : 0xb9b3c9, alpha: 0.35 * (1 - p) });
    }
  };

  return {
    back,
    props,
    update,
    destroy: () => {
      back.destroy({ children: true });
      for (const p of props) p.destroy({ children: true });
    },
  };
}

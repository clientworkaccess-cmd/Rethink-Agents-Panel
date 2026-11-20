// The office room, drawn with Pixi Graphics (original art, no image assets). Front-facing view: back wall
// with the chart board, window(s), real-time clock, whiteboard and notice board; server racks and a console
// on the left; coffee corner and bookshelf on the right; one cubicle per agent (role tag with a live status
// dot, monitor, desk lamp, personal items); a meeting table with a screen; plants and floor lights.
// Light theme = daytime (sun in the window); dark theme = night (moon, stars, glowing lamps and monitors).
// Ambient life: clock, swaying plants, monitor flicker, blinking rack LEDs, scrolling console, live chart on
// the meeting screen, coffee steam, twinkling stars. All of it stops under reduced motion except the clock.
import { Container, Graphics, Text } from "pixi.js";
import { hash, mix } from "@/components/character/model";
import { CUB_W, CUBE, SIDE_W, WALL_H, type Layout } from "./world";

export type DeskOwner = { id: string; name: string; color: number } | null;

type Palette = {
  night: boolean;
  wall: number;
  wallTrim: number;
  wallShade: number;
  floor: number;
  plank: number;
  ledge: number;
  panel: number;
  panelTop: number;
  panelBase: number;
  desk: number;
  deskEdge: number;
  deskLeg: number;
  monitor: number;
  screen: number;
  paper: number;
  ink: number;
  board: number;
  cork: number;
  rug: number;
  rugLine: number;
  wood: number;
  woodEdge: number;
  chair: number;
  meetChair: number;
  leaf: number[];
  pot: number;
  metal: number;
  tagBg: number;
  tagFg: number;
  tagLine: number;
  lampShade: number;
};

const ACCENT = 0x7451f2;
const WARM = 0xffd38a;

const DAY: Palette = {
  night: false,
  wall: 0xf1eef8,
  wallTrim: 0xd9d2ea,
  wallShade: 0xe6e1f1,
  floor: 0xe9e2d8,
  plank: 0xdcd3c6,
  ledge: 0xd4cde3,
  panel: 0xd2cbe4,
  panelTop: 0xe6e1f2,
  panelBase: 0xbcb4d3,
  desk: 0xfbfaff,
  deskEdge: 0xd8d2e6,
  deskLeg: 0xb3abc8,
  monitor: 0x3a3450,
  screen: 0xc9bfff,
  paper: 0xffffff,
  ink: 0x2a2440,
  board: 0xfbfaff,
  cork: 0xd9b68a,
  rug: 0xe3dcf7,
  rugLine: 0xb9aee6,
  wood: 0xc9a57c,
  woodEdge: 0xa9855e,
  chair: 0x5b5470,
  meetChair: 0x8c78e8,
  leaf: [0x6fbf7f, 0x57a86b, 0x86cf94],
  pot: 0xd98d6c,
  metal: 0x8e88a3,
  tagBg: 0xffffff,
  tagFg: 0x2a2440,
  tagLine: 0xc7bfdd,
  lampShade: 0xf3ead6,
};

const NIGHT: Palette = {
  night: true,
  wall: 0x2b2542,
  wallTrim: 0x3a3258,
  wallShade: 0x251f3a,
  floor: 0x2a2539,
  plank: 0x241f33,
  ledge: 0x342d4d,
  panel: 0x463d64,
  panelTop: 0x564c78,
  panelBase: 0x3a3254,
  desk: 0x4e4569,
  deskEdge: 0x3d3555,
  deskLeg: 0x5b5278,
  monitor: 0x15121e,
  screen: 0x7a62ff,
  paper: 0xe4def5,
  ink: 0x2a2440,
  board: 0xe9e4f7,
  cork: 0x8c6a45,
  rug: 0x332a55,
  rugLine: 0x6a56c9,
  wood: 0x7a5a40,
  woodEdge: 0x5e4430,
  chair: 0x221d31,
  meetChair: 0x5a43c9,
  leaf: [0x4a9a5c, 0x3c8450, 0x5aab6a],
  pot: 0xa86650,
  metal: 0x5f5878,
  tagBg: 0x1f1a2f,
  tagFg: 0xf1eefb,
  tagLine: 0x5b5278,
  lampShade: 0xffe6b0,
};

export type Room = {
  /** Background layer (wall, floor, rug): below every character. */
  back: Container;
  /** Depth-sorted props to put in the same sorted layer as the characters (zIndex = floor y). */
  props: Container[];
  /** Status dot colour on a cubicle tag (null = unassigned). */
  setStatus: (slot: number, color: number | null) => void;
  /** Per-frame ambient animation. */
  update: (tSec: number, reduced: boolean) => void;
  destroy: () => void;
};

const glow = (g: Graphics, x: number, y: number, r: number, color: number, a: number, rings = 6) => {
  for (let i = 0; i < rings; i++) g.circle(x, y, r * (1 - i / rings)).fill({ color, alpha: a });
};

export function buildRoom(layout: Layout, owners: DeskOwner[], dark: boolean, fonts: { mono: string }): Room {
  const P = dark ? NIGHT : DAY;
  const W = layout.width;
  const H = layout.height;
  const back = new Container();
  const props: Container[] = [];
  const prop = (z: number, ...children: Container[]) => {
    const c = new Container();
    c.zIndex = z;
    c.addChild(...children);
    props.push(c);
    return c;
  };

  // ---------- floor, wall, front ledge ----------
  const bg = new Graphics();
  bg.rect(0, WALL_H, W, H - WALL_H).fill(P.floor);
  for (let y = WALL_H + 30; y < H; y += 30) bg.rect(0, y, W, 1.2).fill(P.plank);
  for (let y = WALL_H; y < H; y += 30) for (let x = ((y / 30) % 2) * 80; x < W; x += 160) bg.rect(x, y, 1.2, 30).fill(P.plank);
  // soft shadow along the wall
  for (let i = 0; i < 4; i++) bg.rect(0, WALL_H + i * 4, W, 4).fill({ color: 0x000000, alpha: (P.night ? 0.12 : 0.05) * (1 - i / 4) });
  bg.rect(0, 0, W, WALL_H).fill(P.wall);
  bg.rect(0, 0, W, 10).fill(P.wallTrim);
  for (let x = 30; x < W; x += 60) bg.rect(x, 10, 1, WALL_H - 22).fill({ color: P.wallShade, alpha: 0.7 });
  bg.rect(0, WALL_H - 12, W, 12).fill(P.wallTrim);
  bg.rect(0, WALL_H - 12, W, 2).fill({ color: 0xffffff, alpha: P.night ? 0.06 : 0.4 });
  // side columns: a slightly different floor tone frames the work area
  bg.rect(0, WALL_H, SIDE_W - 14, H - WALL_H).fill({ color: 0x000000, alpha: P.night ? 0.06 : 0.025 });
  bg.rect(W - SIDE_W + 14, WALL_H, SIDE_W - 14, H - WALL_H).fill({ color: 0x000000, alpha: P.night ? 0.06 : 0.025 });
  // front ledge with floor lights
  bg.rect(0, H - 30, W, 30).fill(P.ledge);
  bg.rect(0, H - 30, W, 3).fill({ color: 0xffffff, alpha: P.night ? 0.08 : 0.35 });
  const floorLights = new Graphics();
  for (let x = 120; x < W - 60; x += 220) {
    if (P.night) glow(floorLights, x, H - 24, 46, WARM, 0.035);
    floorLights.roundRect(x - 12, H - 22, 24, 6, 3).fill(P.night ? 0xffe2a8 : 0xf6efe0);
  }

  // ---------- meeting rug ----------
  const T = layout.table;
  bg.roundRect(T.x - T.hw - 46, T.y - 70, T.hw * 2 + 92, 150, 6).fill(P.rug);
  bg.roundRect(T.x - T.hw - 36, T.y - 60, T.hw * 2 + 72, 130, 4).stroke({ width: 2, color: P.rugLine, alpha: 0.8 });

  // ---------- wall items ----------
  const wallG = new Graphics();
  const sky = new Graphics();
  const stars = new Graphics();
  const hands = new Graphics();
  let clockAt = { x: 0, y: 0 };
  const windows: { x: number; y: number; w: number; h: number }[] = [];
  const ceiling = new Graphics();
  const lampXs: number[] = [];
  layout.wall.forEach((it, i) => {
    const top = 30;
    const h = 96;
    const x = it.x;
    if (i > 0) lampXs.push(x - (x - (layout.wall[i - 1].x + layout.wall[i - 1].w)) / 2);
    switch (it.kind) {
      case "chart": {
        wallG.roundRect(x + 3, top + 4, it.w, h, 4).fill({ color: 0x000000, alpha: 0.08 });
        wallG.roundRect(x, top, it.w, h, 4).fill(P.board).stroke({ width: 2, color: P.wallTrim });
        const bars = [30, 44, 36, 52, 66];
        bars.forEach((bh, k) => wallG.roundRect(x + 20 + k * 22, top + h - 12 - bh, 14, bh, 2).fill(k === bars.length - 1 ? ACCENT : mix(ACCENT, P.board, 0.68)));
        wallG
          .moveTo(x + it.w - 70, top + h - 26)
          .lineTo(x + it.w - 52, top + h - 44)
          .lineTo(x + it.w - 38, top + h - 36)
          .lineTo(x + it.w - 18, top + 22)
          .stroke({ width: 2, color: mix(ACCENT, P.board, 0.35), cap: "round", join: "round" });
        wallG.circle(x + it.w - 18, top + 22, 3.5).fill(0xf27ca8);
        break;
      }
      case "window": {
        windows.push({ x, y: top + 2, w: it.w, h: h - 4 });
        wallG.roundRect(x - 6, top - 4, it.w + 12, h + 8, 5).fill(P.night ? 0x1a1630 : 0xd6cfe6);
        break;
      }
      case "clock":
        clockAt = { x: x + it.w / 2, y: top + 40 };
        wallG.circle(clockAt.x + 2, clockAt.y + 3, 22).fill({ color: 0x000000, alpha: 0.1 });
        wallG.circle(clockAt.x, clockAt.y, 22).fill(P.board).stroke({ width: 3, color: P.wallTrim });
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          wallG.circle(clockAt.x + Math.cos(a) * 16, clockAt.y + Math.sin(a) * 16, k % 3 ? 0.9 : 1.7).fill(P.ink);
        }
        break;
      case "whiteboard":
        wallG.roundRect(x + 3, top + 4, it.w, h, 4).fill({ color: 0x000000, alpha: 0.08 });
        wallG.roundRect(x, top, it.w, h, 4).fill(P.board).stroke({ width: 3, color: P.metal });
        wallG.moveTo(x + 18, top + 24).lineTo(x + 110, top + 24).stroke({ width: 2, color: P.ink, alpha: 0.35, cap: "round" });
        wallG.moveTo(x + 18, top + 44).lineTo(x + it.w - 40, top + 44).stroke({ width: 2, color: P.ink, alpha: 0.22, cap: "round" });
        wallG.moveTo(x + 18, top + 64).lineTo(x + 120, top + 64).stroke({ width: 2.4, color: ACCENT, alpha: 0.75, cap: "round" });
        wallG.circle(x + it.w - 34, top + 64, 11).stroke({ width: 2, color: 0xf27ca8 });
        wallG.roundRect(x + it.w / 2 - 44, top + h + 1, 88, 5, 2).fill(P.metal);
        wallG.roundRect(x + it.w / 2 - 30, top + h - 2, 12, 3, 1).fill(0x3b82f6);
        wallG.roundRect(x + it.w / 2 - 14, top + h - 2, 12, 3, 1).fill(0xef4444);
        break;
      case "notice": {
        wallG.roundRect(x + 3, top + 4, it.w, h, 4).fill({ color: 0x000000, alpha: 0.08 });
        wallG.roundRect(x, top, it.w, h, 4).fill(P.cork).stroke({ width: 3, color: mix(P.cork, 0x000000, 0.25) });
        const notes: [number, number, number, number, number][] = [
          [16, 14, 44, 42, 0xf6c453],
          [70, 10, 50, 34, 0xf4f1ea],
          [130, 18, 38, 56, 0x6fa8dc],
          [76, 52, 40, 32, 0xf08fb0],
        ];
        notes.forEach(([nx, ny, nw, nh, c], k) => {
          const cc = P.night ? mix(c, 0x000000, 0.25) : c;
          wallG.rect(x + nx, top + ny, nw, nh).fill(cc);
          wallG.rect(x + nx + 6, top + ny + 10, nw - 12, 2.5).fill({ color: 0x2a2440, alpha: 0.25 });
          wallG.rect(x + nx + 6, top + ny + 17, nw - 20, 2.5).fill({ color: 0x2a2440, alpha: 0.15 });
          wallG.circle(x + nx + nw / 2, top + ny + 3, 2.6).fill(k % 2 ? ACCENT : 0xe5533d);
        });
        break;
      }
    }
  });
  // ceiling lamps between wall items (and one at each end)
  if (layout.wall.length) {
    lampXs.unshift(Math.max(30, layout.wall[0].x / 2));
    for (const x of lampXs) {
      if (P.night) glow(ceiling, x, 14, 70, WARM, 0.03);
      ceiling.roundRect(x - 16, 8, 32, 7, 3).fill(P.night ? 0xffe2a8 : 0xf8f2e2);
      ceiling.roundRect(x - 16, 8, 32, 2, 1).fill({ color: 0x000000, alpha: 0.12 });
    }
  }
  // the shelf on the wall over the coffee corner
  const shX = W - SIDE_W + 18;
  wallG.roundRect(shX, 62, SIDE_W - 36, 6, 2).fill(P.woodEdge);
  [0xf27ca8, 0x7aa7ff, 0xf6c453, 0x5fc99a, 0xb39cff].forEach((c, k) => wallG.roundRect(shX + 6 + k * 14, 38, 10, 24, 2).fill(P.night ? mix(c, 0x000000, 0.2) : c));
  wallG.roundRect(shX + SIDE_W - 66, 46, 14, 16, 3).fill(P.pot);
  wallG.circle(shX + SIDE_W - 62, 40, 7).fill(P.leaf[0]).circle(shX + SIDE_W - 56, 42, 6).fill(P.leaf[2]);

  // window frames are drawn above the sky
  const frames = new Graphics();
  for (const w of windows) {
    frames.rect(w.x + w.w / 2 - 2, w.y, 4, w.h).fill(P.night ? 0x3a3258 : 0xffffff);
    frames.rect(w.x, w.y + w.h / 2 - 2, w.w, 4).fill(P.night ? 0x3a3258 : 0xffffff);
    frames.roundRect(w.x - 10, w.y + w.h + 2, w.w + 20, 7, 2).fill(P.wallTrim);
  }

  back.addChild(bg, floorLights, wallG, sky, stars, frames, hands, ceiling);

  // ---------- left column: server racks + console ----------
  const R = layout.rack;
  const rack = new Graphics();
  const rackBase = R.y + R.h;
  const rackTop = rackBase - 132;
  for (let k = 0; k < 2; k++) {
    const rx = R.x + k * (R.w / 2 + 2);
    const rw = R.w / 2 - 2;
    rack.roundRect(rx, rackTop, rw, 132, 4).fill(P.night ? 0x1b1828 : 0x3b3650);
    rack.roundRect(rx + 4, rackTop + 6, rw - 8, 120, 2).fill(P.night ? 0x241f36 : 0x4a4463);
    for (let u = 0; u < 7; u++) rack.roundRect(rx + 7, rackTop + 12 + u * 16, rw - 14, 11, 1.5).fill(P.night ? 0x2f2946 : 0x575072);
  }
  rack.ellipse(R.x + R.w / 2, rackBase + 2, R.w / 2 + 6, 5).fill({ color: 0x000000, alpha: 0.12 });
  const leds = new Graphics();
  const ledSlots: { x: number; y: number; c: number; seed: number }[] = [];
  for (let k = 0; k < 2; k++)
    for (let u = 0; u < 7; u++)
      for (let j = 0; j < 3; j++)
        ledSlots.push({ x: R.x + k * (R.w / 2 + 2) + 12 + j * 6, y: rackTop + 17.5 + u * 16, c: [0x5fe39b, 0x7a8cff, 0x5fe39b][j], seed: k * 31 + u * 7 + j });
  // a console screen on top of the racks
  const consoleG = new Graphics();
  const cX = R.x + 6;
  const cY = rackTop - 46;
  const cW = R.w - 12;
  consoleG.roundRect(cX - 4, cY - 4, cW + 8, 44, 4).fill(P.night ? 0x15121e : 0x2f2a42);
  consoleG.rect(cX + cW / 2 - 3, cY + 40, 6, 6).fill(P.metal);
  const code = new Graphics();
  if (P.night) glow(consoleG, cX + cW / 2, cY + 18, 60, 0x3fd6b0, 0.02);
  prop(rackBase, rack, leds, consoleG, code);

  // ---------- right column: coffee corner + bookshelf ----------
  const C = layout.coffee;
  const coffee = new Graphics();
  coffee.roundRect(C.x, C.y - 30, C.w, C.h + 30, 4).fill(P.night ? 0x3d3556 : 0xe4def0).stroke({ width: 1.5, color: P.deskEdge });
  coffee.rect(C.x, C.y - 30, C.w, 6).fill(P.night ? 0x4c4369 : 0xf6f3fb);
  coffee.rect(C.x + C.w / 2 - 0.5, C.y - 18, 1, C.h + 14).fill({ color: 0x000000, alpha: 0.15 });
  coffee.circle(C.x + C.w / 2 - 6, C.y - 2, 1.5).fill(P.metal).circle(C.x + C.w / 2 + 6, C.y - 2, 1.5).fill(P.metal);
  const mX = C.x + 12;
  coffee.roundRect(mX, C.y - 72, 34, 42, 5).fill(P.night ? 0x4a4360 : 0x3a3450);
  coffee.roundRect(mX + 6, C.y - 66, 22, 9, 2).fill(ACCENT);
  coffee.roundRect(mX + 9, C.y - 48, 16, 14, 2).fill(0x26222f);
  coffee.roundRect(mX + 12, C.y - 42, 10, 9, 2).fill(0xffffff);
  coffee.roundRect(C.x + C.w - 40, C.y - 44, 11, 13, 3).fill(0xf6c453);
  coffee.roundRect(C.x + C.w - 24, C.y - 42, 11, 11, 3).fill(0xf27ca8);
  const steam = new Graphics();
  prop(C.y + C.h, coffee, steam);

  const S = layout.shelf;
  const shelf = new Graphics();
  const sTop = S.y + S.h - 120;
  shelf.roundRect(S.x, sTop, S.w, 120, 4).fill(P.night ? 0x3d3556 : 0xe4def0).stroke({ width: 1.5, color: P.deskEdge });
  for (let k = 1; k < 3; k++) shelf.rect(S.x + 4, sTop + k * 40, S.w - 8, 4).fill(P.night ? 0x2d2742 : 0xcfc7e2);
  const bookColors = [0xd9d4ea, 0x7aa7ff, 0xf6c453, 0xa996ff, 0x5fc99a, 0xf27ca8];
  for (let k = 0; k < 2; k++)
    for (let b = 0; b < 5; b++) {
      const c = bookColors[(b + k * 2) % bookColors.length];
      shelf.roundRect(S.x + 8 + b * 13, sTop + 10 + k * 40, 10, 28, 1.5).fill(P.night ? mix(c, 0x000000, 0.25) : c);
    }
  shelf.roundRect(S.x + 8, sTop + 92, S.w - 16, 22, 2).fill(P.night ? 0x342d4b : 0xd7d0e6);
  shelf.circle(S.x + S.w / 2, sTop + 103, 1.8).fill(P.metal);
  const shelfPlant = plantShape(P, S.x + S.w - 18, sTop - 2, 0.75);
  prop(S.y + S.h, shelf, shelfPlant.c);

  // ---------- corner plants ----------
  const plants: Container[] = [shelfPlant.leaves];
  for (const [x, y, s] of [
    [40, H - 36, 1.35],
    [W - 40, H - 36, 1.35],
  ] as const) {
    const p = plantShape(P, x, y, s);
    plants.push(p.leaves);
    prop(y, p.c);
  }

  // ---------- cubicles ----------
  const dots: Graphics[] = [];
  const monitorGlows: Graphics[] = [];
  const screens: { g: Graphics; seed: number }[] = [];
  layout.seats.forEach((s, i) => {
    const owner = owners[i] ?? null;
    const seed = owner ? hash(owner.id + ":desk") : i * 977;
    const half = CUB_W / 2 - 10;
    const pTop = CUBE.panelY - CUBE.panelH;

    // back panel, with a role tag and a few pinned notes
    const panel = new Graphics();
    panel.roundRect(-half, pTop, half * 2, CUBE.panelH, 4).fill(P.panel);
    panel.roundRect(-half, pTop, half * 2, 6, 3).fill(P.panelTop);
    panel.rect(-half, CUBE.panelY - 6, half * 2, 6).fill(P.panelBase);
    for (let x = -half + 18; x < half - 10; x += 18) panel.rect(x, pTop + 10, 1, CUBE.panelH - 18).fill({ color: 0x000000, alpha: 0.04 });
    const noteX = seed % 2 ? 26 : -96;
    [0xf6c453, 0x9fd8ff, 0xf6a5c0].slice(0, 1 + (seed % 3)).forEach((c, k) =>
      panel.rect(noteX + k * 16, pTop + 18 + (k % 2) * 6, 13, 13).fill(P.night ? mix(c, 0x000000, 0.3) : c),
    );
    if (seed % 5 < 2) {
      // a little framed photo / calendar
      panel.roundRect(noteX + 56, pTop + 16, 20, 24, 2).fill(0xffffff).stroke({ width: 1, color: P.panelBase });
      panel.rect(noteX + 59, pTop + 19, 14, 10).fill(owner ? owner.color : P.metal);
    }
    const name = owner ? owner.name.toUpperCase() : "OPEN";
    const label = new Text({
      text: name.length > 18 ? name.slice(0, 17) + "…" : name,
      style: { fontFamily: fonts.mono, fontSize: 10, fill: P.tagFg, letterSpacing: 0.6, fontWeight: "600" },
      resolution: 2,
    });
    label.anchor.set(0, 0.5);
    // the web font may not be measured yet on first paint: size the tag for the mono advance width too
    const tagW = Math.max(label.width, label.text.length * 6.7) + 30;
    const tag = new Graphics();
    tag.roundRect(-tagW / 2, pTop - 11, tagW, 20, 6).fill(P.tagBg).stroke({ width: 1, color: P.tagLine });
    label.position.set(-tagW / 2 + 20, pTop - 1);
    label.alpha = owner ? 1 : 0.5;
    const dot = new Graphics();
    dot.position.set(-tagW / 2 + 11, pTop - 1);
    dots.push(dot);
    const panelC = prop(s.y + CUBE.panelY, panel, tag, dot, label);
    panelC.position.set(s.x, s.y);

    // side partitions (with a soft light strip at night)
    const sides = new Graphics();
    for (const side of [-1, 1]) {
      const x = side * CUBE.sideX;
      sides.roundRect(x - 5, pTop - 4, 10, CUBE.panelH - CUBE.panelY + 6, 3).fill(P.panelTop);
      sides.rect(x - 5, pTop - 4, 10, 4).fill({ color: 0xffffff, alpha: P.night ? 0.08 : 0.5 });
      sides.rect(x + side * 3 - 1, 0, 2, 2).fill({ color: 0x000000, alpha: 0.2 });
      if (P.night) sides.roundRect(x - side * 7 - 1, pTop + 6, 2, 40, 1).fill({ color: WARM, alpha: 0.55 });
    }
    const sideC = prop(s.y + 2, sides);
    sideC.position.set(s.x, s.y);

    // chair back (behind the seated character), with a stripe in the owner's colour
    const chair = new Graphics();
    chair.roundRect(-17, -60, 34, 32, 7).fill(P.chair);
    chair.roundRect(-17, -60, 34, 5, 3).fill({ color: 0xffffff, alpha: P.night ? 0.06 : 0.12 });
    chair.rect(-17, -40, 34, 3).fill(owner ? owner.color : P.metal);
    chair.roundRect(-22, -30, 6, 14, 3).fill(mix(P.chair, 0x000000, 0.15));
    chair.roundRect(16, -30, 6, 14, 3).fill(mix(P.chair, 0x000000, 0.15));
    const chairC = prop(s.y - 1, chair);
    chairC.position.set(s.x, s.y);

    // desk: top, front edge, legs; monitor, keyboard, lamp and personal items
    const desk = new Graphics();
    const hw = CUBE.deskHalfW + 6;
    desk.ellipse(0, 0, hw, 5).fill({ color: 0x000000, alpha: 0.08 });
    desk.rect(-hw + 4, -44, 5, 44).fill(P.deskLeg);
    desk.rect(hw - 9, -44, 5, 44).fill(P.deskLeg);
    desk.roundRect(-hw, -60, hw * 2, 14, 3).fill(P.desk).stroke({ width: 1, color: P.deskEdge });
    desk.rect(-hw, -47, hw * 2, 6).fill(mix(P.desk, 0x000000, P.night ? 0.18 : 0.07));
    // monitor (left), turned toward the seat
    desk.rect(-48, -70, 4, 12).fill(P.monitor);
    desk.ellipse(-46, -58, 9, 2.4).fill(P.monitor);
    desk.roundRect(-68, -98, 44, 30, 3).fill(P.monitor);
    const scr = new Graphics();
    scr.position.set(-65, -95);
    screens.push({ g: scr, seed });
    // keyboard
    desk.roundRect(-15, -58, 30, 6, 1.5).fill(P.night ? 0x2e2842 : 0xe0dbea).stroke({ width: 0.8, color: P.deskEdge });
    // lamp (right)
    const lamp = new Graphics();
    if (P.night) {
      glow(lamp, 60, -66, 44, WARM, 0.035);
      lamp.poly([52, -84, 70, -84, 82, -58, 40, -58]).fill({ color: WARM, alpha: 0.12 });
    }
    lamp.ellipse(56, -58, 7, 2.2).fill(P.metal);
    lamp.moveTo(56, -59).lineTo(52, -76).lineTo(62, -88).stroke({ width: 2, color: P.metal, cap: "round", join: "round" });
    lamp.poly([56, -92, 70, -86, 67, -80, 55, -86]).fill(P.lampShade);
    if (P.night) lamp.circle(64, -82, 3).fill(0xfff3d0);
    // personal items, picked per agent
    const items = new Graphics();
    deskItem(items, P, seed % 7, 30, -60);
    deskItem(items, P, (seed >> 3) % 7, -62, -48, true);
    const mGlow = new Graphics();
    glow(mGlow, -46, -84, P.night ? 46 : 24, P.night ? 0x8f7bff : 0xbfb0ff, P.night ? 0.035 : 0.02);
    monitorGlows.push(mGlow);
    const deskC = prop(s.y + CUBE.deskBottom, mGlow, desk, scr, lamp, items);
    deskC.position.set(s.x, s.y + CUBE.deskBottom);
  });

  // ---------- meeting area ----------
  const screenG = new Graphics();
  const sX = T.x;
  const sY = T.y - 160;
  screenG.rect(sX - 3, sY + 60, 6, 26).fill(P.metal);
  screenG.roundRect(sX - 26, sY + 84, 52, 6, 3).fill(P.metal);
  if (P.night) glow(screenG, sX, sY + 30, 90, 0x8f7bff, 0.025);
  screenG.roundRect(sX - 52, sY - 4, 104, 66, 5).fill(P.monitor);
  screenG.roundRect(sX - 47, sY + 1, 94, 56, 3).fill(P.night ? 0x2a2360 : 0x3d3470);
  const chartLive = new Graphics();
  prop(T.y - 74, screenG, chartLive);
  for (const side of [-1, 1]) {
    const p = plantShape(P, sX + side * 69, T.y - 78, 1.05);
    plants.push(p.leaves);
    prop(T.y - 76, p.c);
  }
  const chairsBack = new Graphics();
  const chairsFront = new Graphics();
  for (const k of [-0.62, 0, 0.62]) {
    const x = T.x + k * T.hw;
    chairsBack.roundRect(x - 14, T.y - 50, 28, 24, 7).fill(P.meetChair);
    chairsBack.roundRect(x - 14, T.y - 50, 28, 5, 3).fill({ color: 0xffffff, alpha: 0.15 });
    chairsFront.roundRect(x - 15, T.y + 26, 30, 14, 6).fill(mix(P.meetChair, 0x000000, 0.12));
    chairsFront.rect(x - 11, T.y + 40, 3, 10).fill(P.metal);
    chairsFront.rect(x + 8, T.y + 40, 3, 10).fill(P.metal);
    chairsFront.roundRect(x - 15, T.y + 20, 30, 10, 5).fill(P.meetChair);
  }
  prop(T.y - 30, chairsBack);
  const table = new Graphics();
  table.ellipse(T.x, T.y + 22, T.hw * 0.9, 8).fill({ color: 0x000000, alpha: 0.1 });
  table.rect(T.x - T.hw * 0.55, T.y + 4, 5, 20).fill(P.woodEdge);
  table.rect(T.x + T.hw * 0.55 - 5, T.y + 4, 5, 20).fill(P.woodEdge);
  table.ellipse(T.x, T.y + 5, T.hw, 25).fill(P.woodEdge);
  table.ellipse(T.x, T.y, T.hw, 25).fill(P.wood);
  table.ellipse(T.x - T.hw * 0.25, T.y - 7, T.hw * 0.35, 7).fill({ color: 0xffffff, alpha: P.night ? 0.05 : 0.18 });
  table.roundRect(T.x - 30, T.y - 8, 26, 16, 2).fill(P.paper);
  table.roundRect(T.x - 27, T.y - 4, 18, 2, 1).fill({ color: 0x2a2440, alpha: 0.2 });
  table.roundRect(T.x + 14, T.y - 6, 9, 10, 3).fill(0xffffff);
  table.rect(T.x + 15, T.y - 4, 7, 2).fill(0x8a5a3c);
  table.roundRect(T.x + 34, T.y - 2, 12, 9, 2).fill(P.pot);
  table.circle(T.x + 37, T.y - 6, 5).fill(P.leaf[0]).circle(T.x + 43, T.y - 7, 4.5).fill(P.leaf[2]);
  prop(T.y, table);
  prop(T.y + 40, chairsFront);

  // ---------- ambient ----------
  let lastSkyKey = "";
  const drawSky = () => {
    const now = new Date();
    const h = now.getHours() + now.getMinutes() / 60;
    const key = `${now.getMinutes() >> 3}`;
    if (key === lastSkyKey) return;
    lastSkyKey = key;
    sky.clear();
    stars.clear();
    for (const w of windows) {
      if (P.night) {
        sky.rect(w.x, w.y, w.w, w.h).fill(0x141a3c);
        sky.rect(w.x, w.y + w.h * 0.6, w.w, w.h * 0.4).fill({ color: 0x24305e, alpha: 0.6 });
        for (let i = 0; i < 16; i++) {
          const sx = w.x + 6 + ((i * 37 + w.x) % (w.w - 12));
          const sy = w.y + 6 + ((i * 23) % (w.h - 16));
          stars.circle(sx, sy, i % 4 ? 0.9 : 1.6).fill({ color: 0xffffff, alpha: 0.9 });
        }
        const mx = w.x + w.w * 0.72;
        const my = w.y + 22;
        glow(sky, mx, my, 22, 0xfff4cf, 0.05, 4);
        sky.circle(mx, my, 10).fill(0xfff1c4);
        sky.circle(mx + 5, my - 3, 9).fill(0x141a3c);
        // far city lights at the bottom of the window
        for (let b = 0; b < 6; b++) {
          const bx = w.x + 4 + b * (w.w / 6);
          const bh = 10 + ((b * 13 + w.x) % 18);
          sky.rect(bx, w.y + w.h - bh, w.w / 6 - 3, bh).fill(0x1e2448);
          sky.rect(bx + 4, w.y + w.h - bh + 4, 2, 2).fill({ color: WARM, alpha: 0.8 });
        }
      } else {
        // daytime always; the sun moves across the window with the real time of day
        const k = Math.min(1, Math.max(0, (h - 7) / 12));
        const late = h >= 17.5;
        sky.rect(w.x, w.y, w.w, w.h).fill(late ? 0xffd9bd : 0xbfe0ff);
        sky.rect(w.x, w.y + w.h * 0.55, w.w, w.h * 0.45).fill({ color: 0xffffff, alpha: 0.25 });
        sky.circle(w.x + 16 + k * (w.w - 32), w.y + 32 - Math.sin(k * Math.PI) * 14, 10).fill(late ? 0xffa25a : 0xffd45c);
        for (let b = 0; b < 6; b++) {
          const bx = w.x + 4 + b * (w.w / 6);
          const bh = 10 + ((b * 13 + w.x) % 18);
          sky.rect(bx, w.y + w.h - bh, w.w / 6 - 3, bh).fill({ color: 0x9fb3d9, alpha: 0.7 });
        }
      }
    }
  };
  const clouds = new Graphics();
  back.addChildAt(clouds, back.getChildIndex(stars) + 1);
  drawSky();

  const drawScreens = (t: number) => {
    for (const { g, seed } of screens) {
      g.clear();
      g.roundRect(0, 0, 38, 24, 2).fill(P.screen);
      const mode = seed % 3;
      const off = Math.floor(t * 1.5 + (seed % 10)) % 6;
      if (mode === 0) for (let k = 0; k < 4; k++) g.rect(4, 4 + k * 5, 8 + ((k * 7 + off * 3 + seed) % 22), 2).fill({ color: 0xffffff, alpha: 0.75 });
      else if (mode === 1) for (let k = 0; k < 5; k++) g.rect(5 + k * 6, 20 - (4 + ((k * 5 + off * 2 + seed) % 12)), 4, 4 + ((k * 5 + off * 2 + seed) % 12)).fill({ color: 0xffffff, alpha: 0.75 });
      else {
        g.circle(12, 12, 7).fill({ color: 0xffffff, alpha: 0.75 });
        g.moveTo(12, 12).lineTo(12, 5).stroke({ width: 1.5, color: P.screen });
        for (let k = 0; k < 3; k++) g.rect(23, 6 + k * 5, 10, 2).fill({ color: 0xffffff, alpha: 0.6 });
      }
    }
  };
  drawScreens(0);

  const drawChart = (t: number) => {
    chartLive.clear();
    const n = 6;
    for (let k = 0; k < n; k++) {
      const h = 10 + k * 5 + Math.sin(t * 0.8 + k) * 3;
      chartLive.roundRect(sX - 38 + k * 13, sY + 50 - h, 9, h, 1.5).fill(k === n - 1 ? 0xb9a8ff : 0x8a74f0);
    }
    chartLive
      .moveTo(sX - 36, sY + 26)
      .lineTo(sX - 10, sY + 20)
      .lineTo(sX + 8, sY + 22)
      .lineTo(sX + 34, sY + 8 + Math.sin(t) * 2)
      .stroke({ width: 2, color: 0xffffff, alpha: 0.85, cap: "round", join: "round" });
  };
  drawChart(0);

  const drawLeds = (t: number) => {
    leds.clear();
    for (const l of ledSlots) {
      const on = Math.sin(t * (2 + (l.seed % 5)) + l.seed * 1.7) > -0.3;
      leds.circle(l.x, l.y, 1.6).fill({ color: l.c, alpha: on ? 1 : 0.25 });
    }
  };
  drawLeds(0);
  const drawCode = (t: number) => {
    code.clear();
    code.rect(cX, cY, cW, 36).fill(0x101820);
    const off = Math.floor(t * 2.5);
    for (let k = 0; k < 6; k++) {
      const w = 10 + (((k + off) * 37) % (cW - 24));
      code.rect(cX + 4 + (((k + off) % 3) * 4), cY + 4 + k * 5, w, 2).fill({ color: (k + off) % 4 ? 0x3fd6b0 : 0x7a8cff, alpha: 0.85 });
    }
  };
  drawCode(0);

  let lastSlow = -1;
  const update = (t: number, reduced: boolean) => {
    // real-time clock
    const now = new Date();
    const sec = now.getSeconds() + now.getMilliseconds() / 1000;
    const min = now.getMinutes() + sec / 60;
    const hr = (now.getHours() % 12) + min / 60;
    hands.clear();
    const hand = (a: number, len: number, w: number, color: number) =>
      hands
        .moveTo(clockAt.x, clockAt.y)
        .lineTo(clockAt.x + Math.sin(a) * len, clockAt.y - Math.cos(a) * len)
        .stroke({ width: w, color, cap: "round" });
    hand((hr / 12) * Math.PI * 2, 10, 2.6, P.ink);
    hand((min / 60) * Math.PI * 2, 14, 1.9, P.ink);
    hand((Math.floor(sec) / 60) * Math.PI * 2, 15, 1, ACCENT);
    hands.circle(clockAt.x, clockAt.y, 2).fill(ACCENT);
    if (Math.floor(t) % 10 === 0) drawSky();
    if (reduced) return;
    for (let i = 0; i < plants.length; i++) plants[i].rotation = Math.sin(t * 0.9 + i * 1.7) * 0.035;
    for (let i = 0; i < monitorGlows.length; i++) monitorGlows[i].alpha = 0.85 + Math.sin(t * 7 + i * 3) * 0.08 + (Math.sin(t * 23 + i) > 0.97 ? -0.3 : 0);
    stars.alpha = 0.75 + Math.sin(t * 1.3) * 0.25;
    // drifting clouds in daytime windows
    if (!P.night) {
      clouds.clear();
      for (const w of windows) {
        const cx = w.x + ((t * 4 + w.x) % (w.w + 40)) - 20;
        if (cx > w.x + 8 && cx < w.x + w.w - 20) {
          clouds.ellipse(cx, w.y + 56, 13, 5).fill({ color: 0xffffff, alpha: 0.9 });
          clouds.ellipse(cx + 9, w.y + 52, 9, 5).fill({ color: 0xffffff, alpha: 0.9 });
        }
      }
    }
    steam.clear();
    for (let i = 0; i < 3; i++) {
      const p = (t * 0.4 + i / 3) % 1;
      steam.circle(mX + 17 + Math.sin(p * 6 + i) * 3, C.y - 78 - p * 22, 2 + p * 3).fill({ color: P.night ? 0xffffff : 0xb9b3c9, alpha: 0.35 * (1 - p) });
    }
    drawChart(t);
    const slow = Math.floor(t * 4);
    if (slow !== lastSlow) {
      lastSlow = slow;
      drawLeds(t);
      drawCode(t);
      if (slow % 3 === 0) drawScreens(t);
    }
  };

  const setStatus = (slot: number, color: number | null) => {
    const d = dots[slot];
    if (!d) return;
    d.clear();
    if (color === null) d.circle(0, 0, 3.6).stroke({ width: 1.2, color: P.tagLine });
    else d.circle(0, 0, 3.8).fill(color);
  };
  owners.forEach((o, i) => setStatus(i, o ? P.metal : null));
  for (let i = owners.length; i < dots.length; i++) setStatus(i, null);

  return {
    back,
    props,
    setStatus,
    update,
    destroy: () => {
      back.destroy({ children: true });
      for (const p of props) p.destroy({ children: true });
    },
  };
}

/** A potted plant; the leaves sway (returned so the room can animate them). */
function plantShape(P: Palette, x: number, y: number, s: number) {
  const c = new Container();
  c.position.set(x, y);
  const pot = new Graphics();
  pot.ellipse(0, 12 * s, 16 * s, 4.5 * s).fill({ color: 0x000000, alpha: 0.12 });
  pot.poly([-12 * s, -6 * s, 12 * s, -6 * s, 9 * s, 12 * s, -9 * s, 12 * s]).fill(P.pot);
  pot.roundRect(-13.5 * s, -9 * s, 27 * s, 6 * s, 2 * s).fill(mix(P.pot, 0x000000, 0.12));
  const leaves = new Container();
  leaves.position.set(0, -8 * s);
  const lg = new Graphics();
  for (const [dx, dy, r, i] of [
    [-10, -12, 10, 0],
    [9, -14, 11, 1],
    [0, -28, 11, 2],
    [-4, -6, 8, 1],
    [7, -26, 7, 0],
    [-8, -24, 7, 2],
  ])
    lg.circle(dx * s, dy * s, r * s).fill(P.leaf[i]);
  lg.circle(-3 * s, -30 * s, 3 * s).fill({ color: 0xffffff, alpha: 0.12 });
  leaves.addChild(lg);
  c.addChild(pot, leaves);
  return { c, leaves };
}

/** Small personal items on a desk, drawn at (x, y) = where the item stands on the desk top. */
function deskItem(g: Graphics, P: Palette, kind: number, x: number, y: number, small = false) {
  switch (kind) {
    case 0: // mini plant
      g.roundRect(x - 5, y - 9, 10, 9, 2).fill(P.pot);
      g.circle(x - 2, y - 13, 4.5).fill(P.leaf[0]).circle(x + 3, y - 14, 4).fill(P.leaf[2]).circle(x, y - 18, 3.5).fill(P.leaf[1]);
      break;
    case 1: // photo frame
      g.roundRect(x - 6, y - 15, 12, 15, 1.5).fill(0x8a6a4a);
      g.rect(x - 4, y - 13, 8, 9).fill(0x9fd0ff).rect(x - 4, y - 7, 8, 3).fill(0x6fbf7f);
      break;
    case 2: // books
      g.roundRect(x - 8, y - 5, 16, 5, 1).fill(0x6fa8dc);
      g.roundRect(x - 7, y - 10, 14, 5, 1).fill(0xf27ca8);
      g.roundRect(x - 8, y - 14, 15, 4, 1).fill(0xf6c453);
      break;
    case 3: // trophy
      g.rect(x - 4, y - 3, 8, 3).fill(0x8a6a4a);
      g.rect(x - 1, y - 7, 2, 4).fill(0xe6b43c);
      g.poly([x - 5, y - 15, x + 5, y - 15, x + 3, y - 7, x - 3, y - 7]).fill(0xf2c14e);
      break;
    case 4: // mug
      g.roundRect(x - 4, y - 10, 8, 10, 2).fill(0xffffff).stroke({ width: 0.8, color: 0xd6d0c4 });
      g.roundRect(x + 3, y - 8, 3, 5, 1.5).stroke({ width: 1, color: 0xd6d0c4 });
      g.rect(x - 3, y - 9, 6, 2).fill(0x8a5a3c);
      break;
    case 5: // pen cup
      g.roundRect(x - 4, y - 9, 8, 9, 1.5).fill(P.metal);
      g.rect(x - 2, y - 14, 1.2, 6).fill(0xef4444).rect(x + 1, y - 15, 1.2, 7).fill(0x3b82f6);
      break;
    default: // a little figurine
      g.roundRect(x - 4, y - 6, 8, 6, 2).fill(small ? 0xb39cff : 0xf6c453);
      g.circle(x, y - 10, 4.2).fill(small ? 0xb39cff : 0xf6c453);
      g.circle(x - 1.5, y - 10.5, 0.8).fill(0x2a2440).circle(x + 1.5, y - 10.5, 0.8).fill(0x2a2440);
  }
}

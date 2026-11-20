// The character art, described once as SVG path data and rendered by both the Pixi rig (rig.ts) and the SVG
// avatar (Critter.tsx), so the two can never drift apart. Original drawing: chibi proportions (big head,
// small body), clean dark outlines, soft shading. No Pixi or React here.
//
// Coordinates: the character stands on (0, 0), y grows downward. Each part has its own pivot:
//   legs   pivot at HIP_L / HIP_R           arms  pivot at SHOULDER_L / SHOULDER_R, hand at HAND
//   head   pivot at NECK (head-local below) props hand-local (origin = hand centre), emblem centred on (0, 0)
import { mix, type Look } from "./model";

export type Shape = {
  d: string;
  fill?: number;
  alpha?: number;
  /** Stroke width (no stroke when omitted). */
  line?: number;
  stroke?: number;
};

export type Pt = { x: number; y: number };
export type Mouth = "smile" | "grin" | "o" | "flat" | "frown" | "sleep";

export const INK = 0x2a2230;
const LINE = 1.5;
const WHITE = 0xffffff;

export const HIP_L: Pt = { x: -5, y: -15 };
export const HIP_R: Pt = { x: 5, y: -15 };
export const SHOULDER_L: Pt = { x: -11, y: -35.5 };
export const SHOULDER_R: Pt = { x: 11, y: -35.5 };
export const NECK: Pt = { x: 0, y: -38 };
export const HAND: Pt = { x: 0, y: 14.2 };
export const EYE_L: Pt = { x: -6.2, y: -14 };
export const EYE_R: Pt = { x: 6.2, y: -14 };
export const BROW_L: Pt = { x: -6.4, y: -20.4 };
export const BROW_R: Pt = { x: 6.4, y: -20.4 };
/** Top of the hair (absolute), for bubbles and hit areas. */
export const HEAD_TOP = -76;

// ---------- path helpers ----------
const K = 0.5523;
const n = (v: number) => Math.round(v * 100) / 100;

export function rr(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, w / 2, h / 2);
  const c = r * (1 - K);
  const R = x + w;
  const B = y + h;
  return (
    `M${n(x + r)} ${n(y)}L${n(R - r)} ${n(y)}C${n(R - c)} ${n(y)} ${n(R)} ${n(y + c)} ${n(R)} ${n(y + r)}` +
    `L${n(R)} ${n(B - r)}C${n(R)} ${n(B - c)} ${n(R - c)} ${n(B)} ${n(R - r)} ${n(B)}` +
    `L${n(x + r)} ${n(B)}C${n(x + c)} ${n(B)} ${n(x)} ${n(B - c)} ${n(x)} ${n(B - r)}` +
    `L${n(x)} ${n(y + r)}C${n(x)} ${n(y + c)} ${n(x + c)} ${n(y)} ${n(x + r)} ${n(y)}Z`
  );
}

export function el(cx: number, cy: number, rx: number, ry = rx): string {
  const kx = rx * K;
  const ky = ry * K;
  return (
    `M${n(cx + rx)} ${n(cy)}C${n(cx + rx)} ${n(cy + ky)} ${n(cx + kx)} ${n(cy + ry)} ${n(cx)} ${n(cy + ry)}` +
    `C${n(cx - kx)} ${n(cy + ry)} ${n(cx - rx)} ${n(cy + ky)} ${n(cx - rx)} ${n(cy)}` +
    `C${n(cx - rx)} ${n(cy - ky)} ${n(cx - kx)} ${n(cy - ry)} ${n(cx)} ${n(cy - ry)}` +
    `C${n(cx + kx)} ${n(cy - ry)} ${n(cx + rx)} ${n(cy - ky)} ${n(cx + rx)} ${n(cy)}Z`
  );
}

export function poly(...p: number[]): string {
  let d = `M${n(p[0])} ${n(p[1])}`;
  for (let i = 2; i < p.length; i += 2) d += `L${n(p[i])} ${n(p[i + 1])}`;
  return d + "Z";
}

function star(cx: number, cy: number, points: number, outer: number, inner: number): string {
  const p: number[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 ? inner : outer;
    p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return poly(...p);
}

function gear(teeth: number, outer: number, inner: number): string {
  const p: number[] = [];
  const step = (Math.PI * 2) / teeth;
  for (let i = 0; i < teeth; i++) {
    const a = i * step;
    for (const [da, r] of [
      [-0.32, inner],
      [-0.2, outer],
      [0.2, outer],
      [0.32, inner],
    ] as const)
      p.push(Math.cos(a + da * step * 1.6) * r, Math.sin(a + da * step * 1.6) * r);
  }
  return poly(...p);
}

function wedge(cx: number, cy: number, r: number, a0: number, a1: number): string {
  const p = [cx, cy];
  for (let i = 0; i <= 10; i++) {
    const a = a0 + ((a1 - a0) * i) / 10;
    p.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
  return poly(...p);
}

/** Outlined shape. */
const o = (d: string, fill: number, line = LINE): Shape => ({ d, fill, line, stroke: INK });
/** Fill only. */
const s = (d: string, fill: number, alpha = 1): Shape => ({ d, fill, alpha });
/** Stroke only. */
const l = (d: string, stroke: number, line = 1): Shape => ({ d, stroke, line });
const dark = (c: number, t: number) => mix(c, 0x000000, t);

// ---------- body ----------
const BODY =
  "M-11.5 -33C-11.5 -37 -9 -39.5 -5 -39.5L5 -39.5C9 -39.5 11.5 -37 11.5 -33L11 -14C11 -12.5 10 -11.5 8.5 -11.5" +
  "L-8.5 -11.5C-10 -11.5 -11 -12.5 -11 -14Z";
const BODY_SHADE = "M5.5 -39.2C9.5 -38.6 11.5 -36.5 11.5 -33L11 -14C11 -12.5 10 -11.5 8.5 -11.5L6.4 -11.5Z";

function leg(look: Look, side: -1 | 1): Shape[] {
  return [
    o(rr(-3.7, -1, 7.4, 12.5, 3), look.pants),
    s(rr(side > 0 ? -3 : 0.6, 0.5, 2.4, 9.5, 1.2), dark(look.pants, 0.3), 0.35),
    o(el(side * 1.3, 12.4, 5.3, 3.1), look.shoes),
    s(el(side * 1.3 - 1.6, 11.3, 1.9, 0.8), WHITE, 0.28),
  ];
}

function neck(look: Look): Shape[] {
  return [o(rr(-3.6, -42.5, 7.2, 6, 2), look.skin), s(rr(-3.6, -40, 7.2, 2.6, 1), look.skinShade, 0.55)];
}

const collar = (c: number): Shape[] => [o(poly(-5, -39.6, -0.8, -39.6, -3.2, -35.6), c, 0.9), o(poly(5, -39.6, 0.8, -39.6, 3.2, -35.6), c, 0.9)];
const tieShapes = (c: number, long: boolean): Shape[] => [
  o(poly(-1.2, -36.6, 1.2, -36.6, 2.3, long ? -27 : -30, 0, long ? -24.4 : -27.6, -2.3, long ? -27 : -30), c, 0.8),
  o(poly(-1.8, -39.2, 1.8, -39.2, 1.2, -36.6, -1.2, -36.6), mix(c, 0x000000, 0.08), 0.8),
];
const pocketSquare = (c: number): Shape[] => [s(poly(5.4, -31.6, 8.8, -31.6, 8.2, -29.8, 6, -29.8), c), l("M5 -29.7L9 -29.7", INK, 0.8)];

function torso(look: Look): Shape[] {
  const { top, shirt, tie, outfit } = look;
  const shade = s(BODY_SHADE, dark(outfit === "shirt" ? shirt : top, 0.35), 0.4);
  const out: Shape[] = [...neck(look)];
  switch (outfit) {
    case "suit":
      out.push(o(BODY, top), shade, s(poly(-5, -39.5, 5, -39.5, 0, -28), shirt), ...collar(shirt));
      if (tie !== null) out.push(...tieShapes(tie, false));
      out.push(
        l("M-5.4 -39.3L-0.6 -27.4M5.4 -39.3L0.6 -27.4", INK, 1.1),
        l("M-6.8 -36.6L-4.3 -35.3M6.8 -36.6L4.3 -35.3", INK, 0.8),
        s(el(0, -23.4, 0.95), dark(top, 0.5)),
        s(el(0, -18.8, 0.95), dark(top, 0.5)),
        l("M-9 -20.2L-5.2 -20.2", dark(top, 0.45), 1),
        ...pocketSquare(look.accent),
        l("M0 -15.4L0 -11.7", INK, 0.9),
      );
      break;
    case "vest":
      out.push(o(BODY, shirt), s(BODY_SHADE, dark(shirt, 0.3), 0.3), ...collar(shirt));
      if (tie !== null) out.push(...tieShapes(tie, true));
      out.push(
        o(
          "M-10.9 -32.6L-5.4 -38.8L0 -27L5.4 -38.8L10.9 -32.6L10.9 -14C10.9 -12.4 9.9 -11.5 8.4 -11.5L1 -11.5L0 -9.6" +
            "L-1 -11.5L-8.4 -11.5C-9.9 -11.5 -10.9 -12.4 -10.9 -14Z",
          top,
          1.1,
        ),
        s("M5.6 -38.4L10.9 -32.6L10.9 -14C10.9 -12.4 9.9 -11.5 8.4 -11.5L6.6 -11.5Z", dark(top, 0.35), 0.4),
        s(el(0, -24, 0.9), dark(top, 0.55)),
        s(el(0, -20.4, 0.9), dark(top, 0.55)),
        s(el(0, -16.8, 0.9), dark(top, 0.55)),
      );
      break;
    case "shirt":
      out.push(o(BODY, shirt), shade, ...collar(shirt));
      if (tie !== null) out.push(...tieShapes(tie, true));
      else out.push(l("M0 -36L0 -15.6", dark(shirt, 0.2), 0.9), s(el(0, -31, 0.7), dark(shirt, 0.3)), s(el(0, -25, 0.7), dark(shirt, 0.3)));
      out.push(
        l(rr(4.6, -32.2, 4.6, 4, 0.8), dark(shirt, 0.22), 0.8),
        o(rr(-11, -15.6, 22, 2.9, 1), 0x3a2e28, 0.8),
        s(rr(-1.7, -15.8, 3.4, 3.3, 0.6), 0xd8c27a),
      );
      break;
    case "sweater":
      out.push(
        o(BODY, top),
        shade,
        s(poly(-4.2, -39.4, 4.2, -39.4, 0, -33.2), shirt),
        o(poly(-4.2, -39.6, -0.6, -39.6, -2.6, -36.4), shirt, 0.8),
        o(poly(4.2, -39.6, 0.6, -39.6, 2.6, -36.4), shirt, 0.8),
        l("M-4.8 -39.3L0 -32.8L4.8 -39.3", dark(top, 0.35), 1.5),
        s(rr(-11, -15.4, 22, 3.8, 1.5), dark(top, 0.14)),
        l("M-7 -15.2L-7 -11.9M-3.5 -15.2L-3.5 -11.7M0 -15.2L0 -11.6M3.5 -15.2L3.5 -11.7M7 -15.2L7 -11.9", dark(top, 0.3), 0.6),
      );
      break;
    case "blazer":
      out.push(
        o(BODY, top),
        shade,
        s("M-5 -39.4L5 -39.4L4.7 -11.6L-4.7 -11.6Z", shirt),
        l("M-3.6 -39.2Q0 -36.2 3.6 -39.2", dark(shirt, 0.28), 1),
        o(poly(-5.2, -39.5, -2.5, -39.5, -4.7, -28.5), dark(top, 0.12), 0.9),
        o(poly(5.2, -39.5, 2.5, -39.5, 4.7, -28.5), dark(top, 0.12), 0.9),
        l("M-5 -39L-4.7 -11.8M5 -39L4.7 -11.8", INK, 1.1),
        ...pocketSquare(look.accent),
      );
      break;
    case "turtleneck":
      out.push(
        o(BODY, top),
        shade,
        o(rr(-5.2, -43.2, 10.4, 5.8, 2.4), dark(top, 0.1), 1.1),
        l("M-2.6 -42.6L-2.6 -38M0 -42.8L0 -37.8M2.6 -42.6L2.6 -38", dark(top, 0.3), 0.6),
        s(rr(-11, -15.4, 22, 3.6, 1.5), dark(top, 0.12)),
      );
      break;
  }
  return out;
}

function torsoBack(look: Look): Shape[] {
  const c = look.outfit === "shirt" ? look.shirt : look.top;
  const out: Shape[] = [...neck(look), o(BODY, c), s(BODY_SHADE, dark(c, 0.35), 0.4)];
  if (look.outfit === "suit" || look.outfit === "blazer") out.push(l("M0 -20L0 -11.7", INK, 0.9));
  if (look.outfit === "shirt") out.push(o(rr(-11, -15.6, 22, 2.9, 1), 0x3a2e28, 0.8));
  if (look.outfit === "turtleneck") out.push(o(rr(-5.2, -43.2, 10.4, 5.8, 2.4), dark(c, 0.1), 1.1));
  if (look.outfit === "sweater") out.push(s(rr(-11, -15.4, 22, 3.8, 1.5), dark(c, 0.14)));
  return out;
}

function arm(look: Look): Shape[] {
  const sleeve = look.outfit === "shirt" || look.outfit === "vest" ? look.shirt : look.top;
  const out: Shape[] = [o(rr(-3.3, -2.5, 6.6, 13.5, 3.2), sleeve), s(rr(0.6, -1.4, 2.3, 11, 1.1), dark(sleeve, 0.3), 0.35)];
  if (look.outfit === "suit" || look.outfit === "blazer") out.push(o(rr(-3.1, 8.6, 6.2, 2.4, 1), look.shirt, 0.8));
  else if (look.outfit === "sweater" || look.outfit === "turtleneck") out.push(s(rr(-3.3, 8.2, 6.6, 2.8, 1.3), dark(look.top, 0.15)));
  else out.push(o(rr(-3.5, 6.6, 7, 2.6, 1.2), dark(look.shirt, 0.08), 0.8));
  out.push(o(el(HAND.x, HAND.y, 3.6), look.skin), s(el(-1.1, 13, 1.2, 1), WHITE, 0.3));
  return out;
}

// ---------- head ----------
const SKULL = rr(-17, -33, 34, 32, 14);
const CAP = "M-18.6 -13L-18.6 -21C-18.6 -30.5 -10.4 -36 0 -36C10.4 -36 18.6 -30.5 18.6 -21L18.6 -13";
const SHINE = "M2 -33.6C7 -33.9 12 -31 14 -27C10 -29.6 6 -31 2 -31.6Z";
const BACK_COVER = "M-18.6 -9L-18.6 -21C-18.6 -30.5 -10.4 -36 0 -36C10.4 -36 18.6 -30.5 18.6 -21L18.6 -9C14 -6 -14 -6 -18.6 -9Z";

function curlyBumps(look: Look, back: boolean): Shape[] {
  const out: Shape[] = [];
  for (let i = 0; i <= 8; i++) {
    const a = Math.PI + (i / 8) * Math.PI;
    out.push(o(el(Math.cos(a) * 16.5, -19 + Math.sin(a) * 15, 5.2), look.hair, 1.3));
  }
  out.push(o(el(-17.4, -13.5, 3.8), look.hair, 1.3), o(el(17.4, -13.5, 3.8), look.hair, 1.3));
  if (back) {
    out.push(s(rr(-17.5, -32, 35, 24, 10), look.hair));
    for (const x of [-12, -4, 4, 12]) out.push(o(el(x, -8.5, 4), look.hair, 1.3));
    out.push(s(rr(-15, -30, 30, 20, 8), look.hair));
    return out;
  }
  for (const [x, y] of [
    [-11, -23.6],
    [-3.8, -25.2],
    [3.8, -25.2],
    [11, -23.6],
  ])
    out.push(o(el(x, y, 4.3), look.hair, 1.3));
  out.push(s(el(0, -28.4, 15.6, 6.8), look.hair), s(el(5, -31, 4, 1.6), WHITE, 0.16));
  return out;
}

function hairBack(look: Look): Shape[] {
  const h = look.hair;
  switch (look.style) {
    case "bob":
      return [o("M-21 -4L-21 -22C-21 -32.5 -12 -38 0 -38C12 -38 21 -32.5 21 -22L21 -4C21 -2.6 20 -2 18.6 -2L-18.6 -2C-20 -2 -21 -2.6 -21 -4Z", h)];
    case "long":
      return [
        o(
          "M-20.6 1L-20.6 -22C-20.6 -32.5 -12 -38 0 -38C12 -38 20.6 -32.5 20.6 -22L20.6 1C20.6 3 19 4 17 4L13 4C11 4 10 3 10 1" +
            "L-10 1C-10 3 -11 4 -13 4L-17 4C-19 4 -20.6 3 -20.6 1Z",
          h,
        ),
      ];
    case "ponytail":
      return [
        o("M13 -31C25 -32 27 -17 21.5 -6C21 -3.5 18.5 -3.6 18.6 -6.4C19.6 -14 18 -21 12 -25Z", h),
        o(el(15.4, -28.4, 2.3, 2.8), look.color, 1),
      ];
    case "bun":
      return [o(el(0, -37.6, 7, 6.2), h), s(el(-2, -40, 2.4, 1.3), WHITE, 0.18)];
    default:
      return [];
  }
}

function hairFront(look: Look): Shape[] {
  const h = look.hair;
  const hs = look.hairShade;
  const shine = s(SHINE, WHITE, 0.17);
  switch (look.style) {
    case "side":
      return [
        o(CAP + "L16.4 -13C16.4 -18 15.4 -21.5 12.5 -23C7 -25.4 -2 -24.6 -7.6 -27.8C-9.6 -25.6 -12.8 -24 -15.2 -21.4C-16 -19 -16.4 -16 -16.4 -13Z", h),
        l("M-7.6 -27.8C-6 -31 -4 -33.5 -1 -35.2", hs, 1.1),
        l("M-14 -26.6C-11.6 -29.6 -9.6 -31 -8.2 -31.6", hs, 0.9),
        shine,
      ];
    case "crop":
      return [
        o(CAP + "L16.6 -13L16.2 -20C14 -23.4 11 -24.6 8 -24.2L5.4 -26.2L2.6 -24.4L-0.6 -26.6L-3.6 -24.4L-6.8 -26L-9 -24C-12.4 -24 -14.8 -22.6 -16.2 -20L-16.6 -13Z", h),
        l("M-6 -31L-4.4 -28.6M1 -32.4L2 -29.6M7 -31.2L7.6 -28.8", look.hairShade, 0.9),
        shine,
      ];
    case "buzz":
      return [
        o("M-17.4 -17L-17.6 -21C-17.6 -29.6 -10 -34.6 0 -34.6C10 -34.6 17.6 -29.6 17.6 -21L17.4 -17L16.2 -17L15.8 -21.6C13 -25.6 8 -26.4 0 -26.6C-8 -26.4 -13 -25.6 -15.8 -21.6L-16.2 -17Z", h, 1.3),
        s("M2 -32.6C7 -32.6 11 -30.6 13 -27.6C10 -29 6 -30 2 -30.4Z", WHITE, 0.14),
      ];
    case "quiff":
      return [
        o(CAP + "L16.4 -13C16.4 -19 15 -23 11 -24.8C5 -26.8 -5 -26.8 -11 -24.8C-15 -23 -16.4 -19 -16.4 -13Z", h),
        o("M-11 -31C-11 -39 -2 -42.6 6 -40.6C12 -39 15.6 -35 15 -30C11 -33.6 4 -35 -2 -33.4C-6 -32.4 -9 -31.6 -11 -31Z", h, 1.3),
        s("M-4 -38.6C0 -40.4 6 -40.2 10 -37.6C6 -38.4 1 -38.4 -4 -36.6Z", WHITE, 0.2),
      ];
    case "curly":
      return curlyBumps(look, false);
    case "bob":
      return [
        o(
          "M-19.6 -4L-19.6 -21C-19.6 -31 -11 -36.6 0 -36.6C11 -36.6 19.6 -31 19.6 -21L19.6 -4L15 -4L15 -17C15 -20 14.4 -22 12.6 -22.6" +
            "C9 -23.2 7 -22 5 -24.2C2 -22.4 -2 -22.4 -5 -24.6C-7 -22.6 -10 -23 -12.6 -22.6C-14.4 -22 -15 -20 -15 -17L-15 -4Z",
          h,
        ),
        l("M-5 -24.4L-6.4 -30M5 -24.2L6 -29.6M-15.6 -8L-16.6 -18M15.6 -8L16.6 -18", look.hairShade, 0.9),
        shine,
      ];
    case "long":
      return [
        o(
          "M-19.6 -2L-19.6 -21C-19.6 -31 -11 -36.6 0 -36.6C11 -36.6 19.6 -31 19.6 -21L19.6 -2L15.4 -2L15.4 -16C15.4 -22 9 -26 0.6 -27.6" +
            "L0 -26.6L-0.6 -27.6C-9 -26 -15.4 -22 -15.4 -16L-15.4 -2Z",
          h,
        ),
        shine,
      ];
    case "ponytail":
      return [
        o(CAP + "L16.4 -13C16.4 -19 15.6 -22.5 13 -24.6C8 -27.6 -4 -27.6 -10 -25C-14 -23.4 -16.4 -19 -16.4 -13Z", h),
        l("M-9 -25.6C-4 -30 4 -31.6 12 -30", hs, 0.9),
        shine,
      ];
    case "bun":
      return [
        o(CAP + "L16.4 -13C16.4 -19 15 -23.4 11 -25.4C6 -27.6 2 -27.4 0 -26.4C-2 -27.4 -6 -27.6 -11 -25.4C-15 -23.4 -16.4 -19 -16.4 -13Z", h),
        l("M0 -26.4L0 -34.6", hs, 0.9),
        shine,
      ];
  }
}

function faceDetail(look: Look): Shape[] {
  const out: Shape[] = [
    s(el(9.6, -11, 5.4, 8), look.skinShade, 0.16),
    s(el(-10.6, -8.2, 2.8, 1.6), 0xf07f86, 0.32),
    s(el(10.6, -8.2, 2.8, 1.6), 0xf07f86, 0.32),
    l("M-1 -10.8Q0.2 -9.2 1.4 -10.6", look.skinShade, 1.2),
  ];
  const stache = "M-4.8 -7.6C-2.8 -9.4 -0.9 -8.8 0 -8.2C0.9 -8.8 2.8 -9.4 4.8 -7.6C3.2 -6.7 1.2 -7 0 -7.4C-1.2 -7 -3.2 -6.7 -4.8 -7.6Z";
  if (look.facial === "beard")
    out.push(
      o("M-17 -17L-17 -12C-16 -2.5 -8.5 1.4 0 1.4C8.5 1.4 16 -2.5 17 -12L17 -17L14.6 -17C14 -10 9 -5.4 4 -4.8L0 -4L-4 -4.8C-9 -5.4 -14 -10 -14.6 -17Z", look.hair, 1.2),
      o(stache, look.hair, 0.8),
    );
  if (look.facial === "moustache") out.push(o(stache, look.hair, 0.9));
  return out;
}

function accessory(look: Look): Shape[] {
  switch (look.accessory) {
    case "glasses":
      return [
        s(rr(-10.6, -17.6, 8.8, 7.2, 2.4), WHITE, 0.14),
        s(rr(1.8, -17.6, 8.8, 7.2, 2.4), WHITE, 0.14),
        l(rr(-10.6, -17.6, 8.8, 7.2, 2.4) + rr(1.8, -17.6, 8.8, 7.2, 2.4), INK, 1.3),
        l("M-1.8 -15.2Q0 -16.2 1.8 -15.2M-10.6 -15.4L-16.4 -16.4M10.6 -15.4L16.4 -16.4", INK, 1.1),
      ];
    case "round":
      return [
        s(el(-6.2, -14, 4.4), WHITE, 0.14),
        s(el(6.2, -14, 4.4), WHITE, 0.14),
        l(el(-6.2, -14, 4.4) + el(6.2, -14, 4.4), 0x7a5a3a, 1.2),
        l("M-1.8 -14.6Q0 -15.8 1.8 -14.6M-10.6 -14.6L-16.4 -16M10.6 -14.6L16.4 -16", 0x7a5a3a, 1),
      ];
    case "headset":
      return [
        l("M-18.6 -13C-20 -30 -12 -38.4 0 -38.4C12 -38.4 20 -30 18.6 -13", 0x3a3d46, 2.2),
        o(rr(-21.4, -18.6, 5.2, 9.4, 2.2), 0x3a3d46, 1.1),
        o(rr(16.2, -18.6, 5.2, 9.4, 2.2), 0x3a3d46, 1.1),
        l("M-18.8 -10.6C-16.4 -4 -10.6 -3.4 -6 -4.2", 0x3a3d46, 1.3),
        o(el(-5.4, -4.3, 1.6, 1.4), 0x1f2026, 0.8),
      ];
    case "earring":
      return [o(el(-17.3, -8.6, 1.2), 0xe8c35a, 0.7), o(el(17.3, -8.6, 1.2), 0xe8c35a, 0.7)];
    default:
      return [];
  }
}

function backHead(look: Look): Shape[] {
  const h = look.hair;
  const ears = [o(el(-16.8, -14, 3.6, 4.6), look.skin), o(el(16.8, -14, 3.6, 4.6), look.skin)];
  const base = [...ears, o(SKULL, look.skin)];
  switch (look.style) {
    case "bob":
      return [o(rr(-21, -38, 42, 36, 15), h)];
    case "long":
      return hairBack(look);
    case "curly":
      return [...base, ...curlyBumps(look, true)];
    case "ponytail":
      return [
        ...base,
        o(BACK_COVER, h),
        o("M-3 -25C3 -25 4.6 -14 2.4 -2C1.6 1 -1.6 1 -2.4 -2C-4.6 -14 -3 -25 -3 -25Z", h),
        o(el(0, -25.6, 2.8, 2.2), look.color, 1),
      ];
    case "bun":
      return [...base, o(BACK_COVER, h), o(el(0, -30, 6.6, 6), h), s(el(-2, -32, 2.2, 1.2), WHITE, 0.16)];
    default:
      return [...base, o(BACK_COVER, h), l("M0 -34L0 -12", look.hairShade, 0.8)];
  }
}

function ears(look: Look): Shape[] {
  return [
    o(el(-16.8, -14, 3.6, 4.6), look.skin),
    s(el(-16.8, -14, 1.6, 2.6), look.skinShade, 0.6),
    o(el(16.8, -14, 3.6, 4.6), look.skin),
    s(el(16.8, -14, 1.6, 2.6), look.skinShade, 0.6),
  ];
}

// ---------- face parts (animated by the rig) ----------
export const EYE: Shape[] = [s(el(0, 0, 2.5, 3.2), INK), s(el(0.9, -1.1, 0.95), WHITE), s(el(-0.8, 1.3, 0.45), WHITE, 0.6)];
export const EYE_CLOSED: Shape[] = [l("M-2.6 0.2Q0 2 2.6 0.2", INK, 1.4)];
export const STAR_EYE: Shape[] = [o(star(0, 0, 4, 4.2, 1.6), 0xffc83d, 0.8)];
export const browShapes = (look: Look, side: -1 | 1): Shape[] => [
  l(side < 0 ? "M-2.6 0.6Q0 -0.9 2.6 0.3" : "M-2.6 0.3Q0 -0.9 2.6 0.6", look.brow, 1.9),
];
const MOUTH_FILL = 0x5b2330;
export const MOUTHS: Record<Mouth, Shape[]> = {
  smile: [l("M-3 -6.4Q0 -3.8 3 -6.4", INK, 1.5)],
  grin: [o("M-4 -7Q0 -1.4 4 -7Z", MOUTH_FILL, 1.2), s(el(0, -3.9, 1.7, 0.9), 0xf08a8a)],
  o: [o(el(0, -5.4, 1.8, 2.2), MOUTH_FILL, 1)],
  flat: [l("M-2.6 -5.8L2.6 -5.8", INK, 1.5)],
  frown: [l("M-3 -4.6Q0 -7 3 -4.6", INK, 1.5)],
  sleep: [l("M-1.6 -5.8Q0 -4.6 1.6 -5.8", INK, 1.3)],
};
/** Brow offset (y) and tilt (rad, positive = inner end down) per mouth, so the face reads as one expression. */
export const BROW_EXPR: Record<Mouth, [number, number]> = {
  smile: [0, 0],
  grin: [-1.1, -0.05],
  o: [-1.7, -0.05],
  flat: [0.3, 0.14],
  frown: [-0.6, -0.3],
  sleep: [0.6, 0],
};

// ---------- props and emblems ----------
export function propShapes(look: Look): Shape[] {
  switch (look.prop) {
    case "briefcase": {
      const c = look.kind === "ceo" ? 0x5a3522 : 0x2b2a30;
      return [
        o(rr(-9.5, 2.6, 19, 13.5, 2.6), c),
        l("M-9.3 7.2L9.3 7.2", mix(c, WHITE, 0.25), 1),
        o(rr(-1.8, 5.8, 3.6, 2.8, 0.6), 0xc9ccd3, 0.8),
        s(rr(-8, 4, 5, 1.2, 0.6), WHITE, 0.16),
      ];
    }
    case "tablet":
      return [
        o(rr(-6.5, -1, 13, 17, 2.2), 0x34313f),
        s(rr(-5, 0.6, 10, 13.4, 1), 0xeef0ff),
        ...[4, 6.5, 5, 9].map((h, i) => s(rr(-3.8 + i * 2.4, 12.6 - h, 1.6, h, 0.4), i === 3 ? 0x6b5cf0 : 0xb8b0e8)),
      ];
    case "megaphone":
      return [
        o(rr(-1.6, -2, 3.2, 5, 1), 0x34313f, 0.9),
        o(poly(-3, 2.5, 3, 2.5, 9, 14, -9, 14), 0xff8a5c),
        s(poly(-4.3, 5.2, 4.3, 5.2, 5.1, 7, -5.1, 7), WHITE, 0.5),
        o(el(0, 14, 9, 2.4), 0xe0663a, 1),
      ];
    case "magnifier":
      return [o(rr(-1.2, -1, 2.4, 9, 1), 0x6b4f3a, 0.9), { d: el(0, 13, 6), fill: 0xd6ecff, alpha: 0.9, line: 1.8, stroke: INK }, s(el(-2, 11, 1.6, 1), WHITE, 0.9)];
    case "clipboard":
      return [
        o(rr(-7, -0.5, 14, 18, 2), 0xa9784e),
        s(rr(-5.4, 2.2, 10.8, 13.6, 1), 0xfbfbf7),
        l("M-3.6 6L3.6 6M-3.6 9L3.6 9M-3.6 12L1.6 12", 0x9aa3b5, 0.8),
        o(rr(-3, -2, 6, 3.4, 1), 0xc9ccd3, 0.8),
      ];
    case "laptop":
      return [o(rr(-8.5, -1, 17, 12.5, 2), 0xc4c6cf), s(rr(-8.3, -0.8, 16.6, 2.2, 1), 0x9a9cab), s(el(0, 5.4, 1.4), WHITE, 0.9)];
    case "calculator": {
      const keys: Shape[] = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) keys.push(s(rr(-4.2 + c * 3, 6 + r * 2.8, 2.2, 1.8, 0.4), r === 2 && c === 2 ? 0xf09a3a : 0xdfe2ea));
      return [o(rr(-6, -1, 12, 16, 2), 0x3b3f4a), s(rr(-4.4, 0.8, 8.8, 3.6, 0.6), 0xbfe0b4), ...keys];
    }
  }
}

export function emblemShapes(look: Look): Shape[] {
  switch (look.emblem) {
    case "revenue":
      return [
        l("M-11 7L-5 1L-1 4L8.4 -5.4", 0x2fa36b, 2.2),
        o(poly(10.8, -7.8, 4.6, -7.1, 10.1, -1.6), 0x2fa36b, 0.9),
        o(el(-1.4, -0.6, 6.2), 0xf2c14e, 1.2),
        l(el(-1.4, -0.6, 4.4), 0xd19a2a, 0.9),
        l("M0.7 -3C0 -3.9 -3.5 -3.9 -3.5 -1.9C-3.5 0 0.7 -0.8 0.7 1.4C0.7 3.4 -2.8 3.4 -3.8 2.4M-1.4 -4.8L-1.4 3.8", 0x8a5a12, 1.1),
      ];
    case "coins":
      return [5, 1.4, -2.2].flatMap((y) => [o(el(0, y + 1.3, 7, 2.5), 0xd9a53a, 1), o(el(0, y, 7, 2.5), 0xf2c14e, 1)]);
    case "star":
      return [o(star(0, 0, 5, 7.6, 3.3), 0xf6c544, 1.2), s(el(-1.6, -2.2, 1.6, 1), WHITE, 0.5)];
    case "gear":
      return [o(gear(8, 7.4, 5.4), 0x9aa7b8, 1.1), o(el(0, 0, 2.4), 0xf4f4f6, 1)];
    case "target":
      return [o(el(0, 0, 7), 0xe2574c, 1.2), o(el(0, 0, 4.6), WHITE, 1), o(el(0, 0, 2.2), 0xe2574c, 1), l("M0 0L7.4 -7.4", INK, 1.3), o(poly(7.4, -7.4, 10.4, -8, 9.4, -5.6), 0x6b5cf0, 0.8)];
    case "code":
      return [o(rr(-8.5, -6.5, 17, 13, 2.4), 0x2d2f3a), l("M-3 -2.6L-5.6 0L-3 2.6M3 -2.6L5.6 0L3 2.6", 0x5fe39b, 1.4), l("M1 -3.6L-1 3.6", 0x5fe39b, 1.2)];
    case "pie":
      return [o(el(0, 0, 7), 0x6fa8dc, 1.2), o(wedge(0.8, -0.8, 7.2, -Math.PI / 2, 0.35), 0xf2c14e, 1)];
    case "chat":
      return [
        o("M-4 -6.5L4 -6.5C6.2 -6.5 8 -4.7 8 -2.5L8 0.5C8 2.7 6.2 4.5 4 4.5L-1 4.5L-5 8L-4.4 4.5C-6.4 4.3 -8 2.6 -8 0.5L-8 -2.5C-8 -4.7 -6.2 -6.5 -4 -6.5Z", WHITE, 1.2),
        s(el(-3.6, -1, 1.1), 0x6b5cf0),
        s(el(0, -1, 1.1), 0x6b5cf0),
        s(el(3.6, -1, 1.1), 0x6b5cf0),
      ];
    case "bulb":
      return [o(el(0, -1.5, 5.6, 5.8), 0xffe27a, 1.2), o(rr(-2.6, 3.6, 5.2, 4, 1), 0xa7adb9, 1), l("M0 -10L0 -12.4M7.4 -6L9.2 -7.6M-7.4 -6L-9.2 -7.6", 0xf2c14e, 1.3)];
  }
}

export type Art = {
  legL: Shape[];
  legR: Shape[];
  torso: Shape[];
  torsoBack: Shape[];
  arm: Shape[];
  hairBack: Shape[];
  ears: Shape[];
  skull: Shape[];
  face: Shape[];
  hairFront: Shape[];
  accessory: Shape[];
  backHead: Shape[];
  browL: Shape[];
  browR: Shape[];
  prop: Shape[];
  emblem: Shape[];
};

const artMemo = new WeakMap<Look, Art>();

/** Every static part of the character for one Look (memoised per Look object). */
export function artFor(look: Look): Art {
  const hit = artMemo.get(look);
  if (hit) return hit;
  const art: Art = {
    legL: leg(look, -1),
    legR: leg(look, 1),
    torso: torso(look),
    torsoBack: torsoBack(look),
    arm: arm(look),
    hairBack: hairBack(look),
    ears: ears(look),
    skull: [o(SKULL, look.skin)],
    face: faceDetail(look),
    hairFront: hairFront(look),
    accessory: accessory(look),
    backHead: backHead(look),
    browL: browShapes(look, -1),
    browR: browShapes(look, 1),
    prop: propShapes(look),
    emblem: emblemShapes(look),
  };
  artMemo.set(look, art);
  return art;
}


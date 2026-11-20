// Office geometry in logical pixels (the scene is scaled to fit its container).
import type { SpotName } from "./roles";

export type Pt = { x: number; y: number };

export const W = 960;
export const WALL_H = 112;
export const AISLE_Y = 152;
export const COLS = 4;
export const COL_W = 200;
export const ROW_H = 150;
export const FIRST_DESK_Y = 236;

export function sceneHeight(deskCount: number): number {
  const rows = Math.max(1, Math.ceil(deskCount / COLS));
  return FIRST_DESK_Y + rows * ROW_H + 110;
}

/** Desk slots fill rows of 4 and grow downwards. */
export function deskAt(index: number) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  const x = W / 2 + (col - (COLS - 1) / 2) * COL_W;
  const y = FIRST_DESK_Y + row * ROW_H;
  return { x, y, seat: { x, y: y + 4 }, gapX: x + COL_W / 2 };
}

/** Spots on the wall where characters stand to work. */
export const WALL_SPOTS: Record<Exclude<SpotName, "desk">, Pt> = {
  chartWall: { x: 170, y: 134 },
  whiteboard: { x: 420, y: 134 },
  posterBoard: { x: 780, y: 134 },
};

const inDeskArea = (p: Pt) => p.y > AISLE_Y + 12;

/**
 * Waypoints from `from` to `to`, walking between desks (the agent's gap column) and along the aisle,
 * so nobody walks through furniture.
 */
export function route(from: Pt, to: Pt, gapX: number): Pt[] {
  if (Math.hypot(from.x - to.x, from.y - to.y) < 1) return [];
  if (inDeskArea(from) && inDeskArea(to) && Math.abs(from.y - to.y) < 40) return [to];
  const pts: Pt[] = [];
  if (inDeskArea(from)) pts.push({ x: gapX, y: from.y }, { x: gapX, y: AISLE_Y });
  else pts.push({ x: from.x, y: AISLE_Y });
  if (inDeskArea(to)) pts.push({ x: gapX, y: AISLE_Y }, { x: gapX, y: to.y });
  else pts.push({ x: to.x, y: AISLE_Y });
  pts.push(to);
  return pts;
}

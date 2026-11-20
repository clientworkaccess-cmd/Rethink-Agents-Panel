// Office geometry (logical pixels) and walking: furniture rectangles block a 20 px grid, characters walk
// A* paths on it, smoothed by line of sight, so they never cross furniture. Pure logic, no Pixi.
import type { Navigator, Pt, Step } from "@/components/character/brain";

export const W = 1040;
export const WALL_H = 150;
export const COLS = 4;
export const COL_W = 220;
export const ROW_H = 150;
export const FIRST_SEAT_Y = WALL_H + 150;
const CELL = 20;

export type Rect = { x: number; y: number; w: number; h: number };

export type Layout = {
  height: number;
  slots: number;
  tableY: number;
  seats: Pt[];
  spots: Record<string, Pt>;
  blocked: Rect[];
};

export function seatAt(index: number): Pt {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return { x: W / 2 + (col - (COLS - 1) / 2) * COL_W, y: FIRST_SEAT_Y + row * ROW_H };
}

/** Desk footprint (front part) relative to its seat. */
export const DESK = { halfW: 62, top: 8, bottom: 26 };

export function buildLayout(deskCount: number): Layout {
  const slots = Math.max(COLS, Math.ceil(deskCount / COLS) * COLS);
  const rows = slots / COLS;
  const seats = Array.from({ length: slots }, (_, i) => seatAt(i));
  const tableY = FIRST_SEAT_Y + (rows - 1) * ROW_H + 150;
  const height = tableY + 110;
  const spotY = WALL_H + 30;
  const spots: Record<string, Pt> = {
    chartWall: { x: 170, y: spotY },
    whiteboard: { x: 580, y: spotY },
    posterBoard: { x: 800, y: spotY },
    coffee: { x: 925, y: spotY + 34 },
    window: { x: 355, y: spotY },
    stage: { x: W / 2 - 230, y: tableY },
  };
  const blocked: Rect[] = [
    // walls
    { x: 0, y: 0, w: W, h: WALL_H + 8 },
    { x: 0, y: 0, w: 14, h: height },
    { x: W - 14, y: 0, w: 14, h: height },
    { x: 0, y: height - 12, w: W, h: 12 },
    // coffee counter (back right corner)
    { x: 950, y: WALL_H, w: 90, h: 64 },
    // plants
    { x: 18, y: WALL_H + 8, w: 40, h: 36 },
    { x: 18, y: height - 64, w: 44, h: 50 },
    { x: W - 62, y: height - 64, w: 44, h: 50 },
    // meeting table + chairs
    { x: W / 2 - 140, y: tableY - 46, w: 280, h: 92 },
  ];
  for (const s of seats) {
    blocked.push({ x: s.x - DESK.halfW, y: s.y + DESK.top, w: DESK.halfW * 2, h: DESK.bottom - DESK.top });
    blocked.push({ x: s.x - 15, y: s.y - 26, w: 30, h: 14 }); // chair
  }
  return { height, slots, tableY, seats, spots, blocked };
}

export class Grid {
  readonly cols: number;
  readonly rows: number;
  private cells: Uint8Array;

  constructor(private layout: Layout) {
    this.cols = Math.ceil(W / CELL);
    this.rows = Math.ceil(layout.height / CELL);
    this.cells = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++)
      for (let c = 0; c < this.cols; c++) {
        const x = c * CELL + CELL / 2;
        const y = r * CELL + CELL / 2;
        if (layout.blocked.some((b) => x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h)) this.cells[r * this.cols + c] = 1;
      }
  }

  private idx(p: Pt): [number, number] {
    return [Math.max(0, Math.min(this.cols - 1, Math.floor(p.x / CELL))), Math.max(0, Math.min(this.rows - 1, Math.floor(p.y / CELL)))];
  }

  private free(c: number, r: number, open: Set<number>) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return false;
    const i = r * this.cols + c;
    return this.cells[i] === 0 || open.has(i);
  }

  private walkable(p: Pt, open: Set<number>) {
    const [c, r] = this.idx(p);
    return this.free(c, r, open);
  }

  /** A* with 8 neighbours (no corner cutting), then line-of-sight smoothing. */
  path(from: Pt, to: Pt): Pt[] {
    const [sc, sr] = this.idx(from);
    const [gc, gr] = this.idx(to);
    const open = new Set([sr * this.cols + sc, gr * this.cols + gc]);
    const start = sr * this.cols + sc;
    const goal = gr * this.cols + gc;
    const g = new Map<number, number>([[start, 0]]);
    const came = new Map<number, number>();
    const h = (i: number) => {
      const dx = Math.abs((i % this.cols) - gc);
      const dy = Math.abs(Math.floor(i / this.cols) - gr);
      return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    const frontier: [number, number][] = [[h(start), start]];
    const closed = new Set<number>();
    let found = false;
    while (frontier.length) {
      let bi = 0;
      for (let i = 1; i < frontier.length; i++) if (frontier[i][0] < frontier[bi][0]) bi = i;
      const [, cur] = frontier.splice(bi, 1)[0];
      if (cur === goal) {
        found = true;
        break;
      }
      if (closed.has(cur)) continue;
      closed.add(cur);
      const cc = cur % this.cols;
      const cr = Math.floor(cur / this.cols);
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (!dr && !dc) continue;
          const nc = cc + dc;
          const nr = cr + dr;
          if (!this.free(nc, nr, open)) continue;
          if (dr && dc && (!this.free(cc + dc, cr, open) || !this.free(cc, cr + dr, open))) continue;
          const ni = nr * this.cols + nc;
          const cost = (g.get(cur) ?? 0) + (dr && dc ? 1.414 : 1);
          if (cost < (g.get(ni) ?? Infinity)) {
            g.set(ni, cost);
            came.set(ni, cur);
            frontier.push([cost + h(ni), ni]);
          }
        }
    }
    if (!found) return [to];
    const cells: Pt[] = [];
    for (let i: number | undefined = goal; i !== undefined && i !== start; i = came.get(i))
      cells.push({ x: (i % this.cols) * CELL + CELL / 2, y: Math.floor(i / this.cols) * CELL + CELL / 2 });
    cells.reverse();
    cells[cells.length - 1] = to;
    return this.smooth(from, cells, open);
  }

  private clear(a: Pt, b: Pt, open: Set<number>) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const n = Math.ceil(d / 5);
    for (let i = 1; i < n; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n };
      // check a small body width, not just the centre line
      if (!this.walkable(p, open) || !this.walkable({ x: p.x - 6, y: p.y }, open) || !this.walkable({ x: p.x + 6, y: p.y }, open)) return false;
    }
    return true;
  }

  private smooth(from: Pt, pts: Pt[], open: Set<number>): Pt[] {
    const out: Pt[] = [];
    let anchor = from;
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.clear(anchor, pts[j], open)) j--;
      out.push(pts[j]);
      anchor = pts[j];
      i = j + 1;
    }
    return out;
  }
}

/** A Navigator for one character: its desk is home; shared spots get a small per-character offset. */
export function navigatorFor(grid: Grid, layout: Layout, deskIndex: number): Navigator {
  return {
    home: layout.seats[deskIndex] ?? layout.seats[0],
    spot(step: Step, slot: number) {
      const p = layout.spots[step.spot] ?? layout.seats[deskIndex];
      return { x: p.x + ((slot % 3) - 1) * 34, y: p.y + (slot % 2) * 6 };
    },
    path: (from, to) => grid.path(from, to),
  };
}

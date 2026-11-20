// Office geometry (logical pixels) and walking. Pure logic, no Pixi.
//
// The room is front-facing: a back wall (charts, window, clock, whiteboard, notice board), a left column
// (server racks), a right column (coffee corner, bookshelf), a grid of cubicles and a meeting area at the
// front. It scales with the team: 1-6 agents use 3 columns, 7-12 use 4, 13-20 use 5, more use 6; rows are
// added as needed, a partial last row is centred, and one or two leftover cubicles flank the meeting table
// (as in a small real office). Furniture rectangles block a 10 px grid; characters walk A* paths on it,
// smoothed by line of sight, so they never cross furniture.
import type { Navigator, Pt, Step } from "@/components/character/brain";

export const WALL_H = 160;
export const SIDE_W = 150;
export const CUB_W = 236;
export const ROW_H = 190;
export const FIRST_SEAT_Y = WALL_H + 150;
const CELL = 10;

/** Cubicle geometry relative to the seat (where the seated character's feet are). */
export const CUBE = { panelY: -50, panelH: 76, sideX: CUB_W / 2 - 12, deskHalfW: 64, deskTop: 6, deskBottom: 28 };

export type Rect = { x: number; y: number; w: number; h: number };
export type WallItem = { kind: "chart" | "window" | "clock" | "whiteboard" | "notice"; x: number; w: number };

export type Layout = {
  width: number;
  height: number;
  cols: number;
  slots: number;
  seats: Pt[];
  /** Meeting table centre and half width. */
  table: { x: number; y: number; hw: number };
  wall: WallItem[];
  /** Server racks (left column) and the bookshelf / coffee corner (right column), as floor rectangles. */
  rack: Rect;
  shelf: Rect;
  coffee: Rect;
  /** Where new agents walk in from. */
  door: Pt;
  /** Shared work spots; a character picks one by its slot so two agents rarely stand on each other. */
  spots: Record<string, Pt[]>;
  blocked: Rect[];
  /** The inside of each cubicle (behind its desk): only its owner walks through it. */
  interiors: Rect[];
};

export function columnsFor(n: number): number {
  return n <= 6 ? 3 : n <= 12 ? 4 : n <= 20 ? 5 : 6;
}

export function buildLayout(deskCount: number): Layout {
  const n = Math.max(1, deskCount);
  const cols = columnsFor(n);
  const width = SIDE_W * 2 + cols * CUB_W;
  const cx = width / 2;
  const full = Math.floor(n / cols);
  const rem = n % cols;
  const flank = full >= 1 && rem > 0 && rem <= 2 ? rem : 0;
  const gridRows = Math.max(1, full + (rem > 0 && !flank ? 1 : 0));
  const rowY = (r: number) => FIRST_SEAT_Y + r * ROW_H;
  const meetY = rowY(gridRows);
  const colX = (c: number) => SIDE_W + (c + 0.5) * CUB_W;

  const seats: Pt[] = [];
  for (let i = 0; i < n; i++) {
    if (i < full * cols) seats.push({ x: colX(i % cols), y: rowY(Math.floor(i / cols)) });
    else if (flank) seats.push({ x: i - full * cols === 0 ? colX(0) : colX(cols - 1), y: meetY });
    else {
      const k = i - full * cols;
      seats.push({ x: cx + (k - (rem - 1) / 2) * CUB_W, y: rowY(gridRows - 1) });
    }
  }

  const table = { x: cx, y: meetY + 26, hw: flank ? 92 : Math.min(150, cols * CUB_W * 0.2) };
  const height = meetY + 170;

  // back wall: items spread evenly between the left edge and the shelf corner
  const items: WallItem["kind"][] = ["chart", "window", "clock", "whiteboard", "notice"];
  const widths: Record<WallItem["kind"], number> = { chart: 200, window: 132, clock: 48, whiteboard: 196, notice: 180 };
  if (width >= 1300) items.splice(4, 0, "window");
  if (width >= 1560) items.splice(1, 0, "whiteboard");
  const x0 = 56;
  const x1 = width - 150;
  const total = items.reduce((a, k) => a + widths[k], 0);
  const gap = Math.max(16, (x1 - x0 - total) / (items.length + 1));
  let x = x0 + gap;
  const wall: WallItem[] = items.map((kind) => {
    const it = { kind, x, w: widths[kind] };
    x += widths[kind] + gap;
    return it;
  });

  const rack: Rect = { x: 22, y: WALL_H + 96, w: SIDE_W - 52, h: 36 };
  const coffee: Rect = { x: width - SIDE_W + 22, y: WALL_H + 2, w: SIDE_W - 40, h: 44 };
  const shelf: Rect = { x: width - SIDE_W + 26, y: WALL_H + 196, w: SIDE_W - 44, h: 34 };
  const floorY = WALL_H + 30;
  const spotsAt = (kind: WallItem["kind"]) =>
    wall.filter((w) => w.kind === kind).flatMap((w) => [-1, 0, 1].map((d) => ({ x: w.x + w.w / 2 + d * 46, y: floorY + Math.abs(d) * 6 })));
  const spots: Record<string, Pt[]> = {
    chartWall: spotsAt("chart"),
    whiteboard: spotsAt("whiteboard"),
    noticeBoard: spotsAt("notice"),
    window: spotsAt("window"),
    serverRack: [0, 1].map((d) => ({ x: rack.x + 26 + d * 46, y: rack.y + rack.h + 14 })),
    coffee: [{ x: coffee.x + coffee.w / 2, y: coffee.y + coffee.h + 16 }],
    meetingScreen: [-1, 1].map((d) => ({ x: table.x + d * 76, y: table.y - 50 })),
    meetingTable: [
      { x: table.x - table.hw * 0.62, y: table.y - 44 },
      { x: table.x + table.hw * 0.62, y: table.y - 44 },
      { x: table.x - table.hw - 22, y: table.y + 4 },
      { x: table.x + table.hw + 22, y: table.y + 4 },
      { x: table.x - table.hw * 0.6, y: table.y + 58 },
      { x: table.x + table.hw * 0.6, y: table.y + 58 },
    ],
  };

  const blocked: Rect[] = [
    // walls and the front ledge
    { x: 0, y: 0, w: width, h: WALL_H + 10 },
    { x: 0, y: 0, w: 16, h: height },
    { x: width - 16, y: 0, w: 16, h: height },
    { x: 0, y: height - 30, w: width, h: 30 },
    rack,
    coffee,
    shelf,
    // corner plants
    { x: 18, y: height - 76, w: 46, h: 46 },
    { x: width - 64, y: height - 76, w: 46, h: 46 },
    // meeting table, screen and its plants
    { x: table.x - table.hw - 6, y: table.y - 30, w: table.hw * 2 + 12, h: 62 },
    { x: table.x - 46, y: table.y - 92, w: 92, h: 18 },
    { x: table.x - 84, y: table.y - 100, w: 30, h: 24 },
    { x: table.x + 54, y: table.y - 100, w: 30, h: 24 },
  ];
  const interiors: Rect[] = seats.map((s) => ({ x: s.x - CUBE.sideX + 6, y: s.y + CUBE.panelY + 8, w: CUBE.sideX * 2 - 12, h: CUBE.deskTop - CUBE.panelY - 6 }));
  for (const s of seats) {
    blocked.push({ x: s.x - CUB_W / 2 + 8, y: s.y + CUBE.panelY - 6, w: CUB_W - 16, h: 14 });
    for (const side of [-1, 1]) blocked.push({ x: s.x + side * CUBE.sideX - 5, y: s.y + CUBE.panelY - 6, w: 10, h: -CUBE.panelY + 6 });
    blocked.push({ x: s.x - CUBE.deskHalfW, y: s.y + CUBE.deskTop, w: CUBE.deskHalfW * 2, h: CUBE.deskBottom - CUBE.deskTop });
  }
  return { width, height, cols, slots: n, seats, table, wall, rack, shelf, coffee, door: { x: 40, y: height - 100 }, spots, blocked, interiors };
}

/** Min-heap of [priority, index] for A*. */
class Heap {
  private a: number[] = [];
  private p: number[] = [];
  get size() {
    return this.a.length;
  }
  push(pri: number, v: number) {
    const a = this.a;
    const p = this.p;
    a.push(v);
    p.push(pri);
    let i = a.length - 1;
    while (i > 0) {
      const j = (i - 1) >> 1;
      if (p[j] <= p[i]) break;
      [a[i], a[j]] = [a[j], a[i]];
      [p[i], p[j]] = [p[j], p[i]];
      i = j;
    }
  }
  pop(): number {
    const a = this.a;
    const p = this.p;
    const top = a[0];
    const lastV = a.pop()!;
    const lastP = p.pop()!;
    if (a.length) {
      a[0] = lastV;
      p[0] = lastP;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && p[l] < p[m]) m = l;
        if (r < a.length && p[r] < p[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        [p[i], p[m]] = [p[m], p[i]];
        i = m;
      }
    }
    return top;
  }
}

export class Grid {
  readonly cols: number;
  readonly rows: number;
  /** 0 free, 1 furniture, 2 someone's cubicle interior (passable only for its owner). */
  private cells: Uint8Array;
  private soft = false;
  private layout: Layout;

  constructor(layout: Layout) {
    this.layout = layout;
    this.cols = Math.ceil(layout.width / CELL);
    this.rows = Math.ceil(layout.height / CELL);
    this.cells = new Uint8Array(this.cols * this.rows);
    const mark = (b: Rect, v: number) => {
      const c0 = Math.max(0, Math.floor((b.x - CELL / 2) / CELL) + 1);
      const c1 = Math.min(this.cols - 1, Math.ceil((b.x + b.w - CELL / 2) / CELL) - 1);
      const r0 = Math.max(0, Math.floor((b.y - CELL / 2) / CELL) + 1);
      const r1 = Math.min(this.rows - 1, Math.ceil((b.y + b.h - CELL / 2) / CELL) - 1);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (this.cells[r * this.cols + c] === 0 || v === 1) this.cells[r * this.cols + c] = v;
    };
    for (const b of layout.interiors) mark(b, 2);
    for (const b of layout.blocked) mark(b, 1);
  }

  private cellsIn(b: Rect | undefined): number[] {
    if (!b) return [];
    const out: number[] = [];
    for (let r = Math.max(0, Math.floor(b.y / CELL)); r <= Math.min(this.rows - 1, Math.floor((b.y + b.h) / CELL)); r++)
      for (let c = Math.max(0, Math.floor(b.x / CELL)); c <= Math.min(this.cols - 1, Math.floor((b.x + b.w) / CELL)); c++)
        if (this.cells[r * this.cols + c] === 2) out.push(r * this.cols + c);
    return out;
  }

  private idx(p: Pt): [number, number] {
    return [Math.max(0, Math.min(this.cols - 1, Math.floor(p.x / CELL))), Math.max(0, Math.min(this.rows - 1, Math.floor(p.y / CELL)))];
  }

  private free(c: number, r: number, open: Set<number>) {
    if (c < 0 || r < 0 || c >= this.cols || r >= this.rows) return false;
    const i = r * this.cols + c;
    const v = this.cells[i];
    return v === 0 || (v === 2 && this.soft) || open.has(i);
  }

  private walkable(p: Pt, open: Set<number>) {
    const [c, r] = this.idx(p);
    return this.free(c, r, open);
  }

  /** True when the point is inside furniture (for tests and debugging). */
  blockedAt(p: Pt) {
    const [c, r] = this.idx(p);
    return this.cells[r * this.cols + c] === 1;
  }

  /** A* with 8 neighbours (no corner cutting), then line-of-sight smoothing. `own` = the walker's cubicle. */
  path(from: Pt, to: Pt, own?: number): Pt[] {
    const first = this.search(from, to, own);
    if (first) return first;
    // stuck inside someone else's cubicle (the room was just rearranged): let it walk out
    this.soft = true;
    const second = this.search(from, to, own);
    this.soft = false;
    return second ?? [to];
  }

  private search(from: Pt, to: Pt, own?: number): Pt[] | null {
    const [sc, sr] = this.idx(from);
    const [gc, gr] = this.idx(to);
    const start = sr * this.cols + sc;
    const goal = gr * this.cols + gc;
    // the start and goal cells are always walkable (a seat sits between furniture)
    const open = new Set([start, goal, ...this.cellsIn(own === undefined ? undefined : this.layout.interiors[own])]);
    const g = new Float32Array(this.cols * this.rows).fill(Infinity);
    const came = new Int32Array(this.cols * this.rows).fill(-1);
    const closed = new Uint8Array(this.cols * this.rows);
    const h = (i: number) => {
      const dx = Math.abs((i % this.cols) - gc);
      const dy = Math.abs(Math.floor(i / this.cols) - gr);
      return Math.max(dx, dy) + 0.414 * Math.min(dx, dy);
    };
    g[start] = 0;
    const heap = new Heap();
    heap.push(h(start), start);
    let found = false;
    while (heap.size) {
      const cur = heap.pop();
      if (cur === goal) {
        found = true;
        break;
      }
      if (closed[cur]) continue;
      closed[cur] = 1;
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
          const cost = g[cur] + (dr && dc ? 1.414 : 1);
          if (cost < g[ni]) {
            g[ni] = cost;
            came[ni] = cur;
            heap.push(cost + h(ni), ni);
          }
        }
    }
    if (!found) return null;
    const cells: Pt[] = [];
    for (let i = goal; i !== -1 && i !== start; i = came[i]) cells.push({ x: (i % this.cols) * CELL + CELL / 2, y: Math.floor(i / this.cols) * CELL + CELL / 2 });
    cells.reverse();
    if (!cells.length) return [to];
    cells[cells.length - 1] = to;
    return this.smooth(from, cells, open);
  }

  private clear(a: Pt, b: Pt, open: Set<number>) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.ceil(d / 4);
    for (let i = 1; i < steps; i++) {
      const p = { x: a.x + ((b.x - a.x) * i) / steps, y: a.y + ((b.y - a.y) * i) / steps };
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

/** A Navigator for one character: its cubicle is home; shared spots are picked by slot. */
export function navigatorFor(grid: Grid, layout: Layout, deskIndex: number): Navigator {
  return {
    home: layout.seats[deskIndex] ?? layout.seats[0],
    spot(step: Step, slot: number) {
      const list = layout.spots[step.spot];
      if (!list?.length) return layout.seats[deskIndex] ?? layout.seats[0];
      return list[slot % list.length];
    },
    path: (from, to) => grid.path(from, to, deskIndex),
  };
}

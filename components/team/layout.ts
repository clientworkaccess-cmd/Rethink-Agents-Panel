// Team tab: turns agents + reporting lines into a tree, and lays the tree out top-down (a simple tidy tree:
// each subtree is as wide as its children, parents sit centred above them). Pure functions, no DOM.
import type { Agent } from "@/lib/types";

/** Card geometry in px. Must match --spacing-org-node / --spacing-org-node-h in app/globals.css. */
export const NODE_W = 208;
export const NODE_H = 112;
const GAP_X = 24;
const GAP_Y = 72;
const ROOT_GAP = 64;
const CORNER = 10;

export type TreeNode = { agent: Agent; children: TreeNode[]; depth: number; descendants: number };

/**
 * Builds the forest. A manager comes from Paperclip's `/org` tree when it knows the agent, otherwise from the
 * agent's own `reportsTo`. A manager that is unknown, terminated or would create a loop makes the agent a root.
 */
export function buildTree(agents: Agent[], parents: Record<string, string | null> | null): TreeNode[] {
  const byId = new Map(agents.map((a) => [a.id, a]));
  const parentOf = new Map<string, string | null>();
  for (const a of agents) {
    const p = parents && a.id in parents ? parents[a.id] : a.reportsTo;
    parentOf.set(a.id, p && p !== a.id && byId.has(p) ? p : null);
  }
  // loop guard: if walking up from an agent comes back to it, cut the link at that agent
  for (const a of agents) {
    const seen = new Set<string>([a.id]);
    let cur = parentOf.get(a.id) ?? null;
    while (cur) {
      if (seen.has(cur)) {
        parentOf.set(a.id, null);
        break;
      }
      seen.add(cur);
      cur = parentOf.get(cur) ?? null;
    }
  }
  const kids = new Map<string, Agent[]>();
  for (const a of agents) {
    const p = parentOf.get(a.id);
    if (p) kids.set(p, [...(kids.get(p) ?? []), a]);
  }
  const make = (a: Agent, depth: number): TreeNode => {
    const children = (kids.get(a.id) ?? []).map((c) => make(c, depth + 1));
    children.sort((x, y) => y.descendants - x.descendants || x.agent.name.localeCompare(y.agent.name));
    return { agent: a, children, depth, descendants: children.reduce((n, c) => n + 1 + c.descendants, 0) };
  };
  const roots = agents.filter((a) => !parentOf.get(a.id)).map((a) => make(a, 0));
  return roots.sort((x, y) => y.descendants - x.descendants || x.agent.name.localeCompare(y.agent.name));
}

export type Placed = { node: TreeNode; x: number; y: number; open: boolean };
export type Edge = { from: string; to: string; d: string };
export type Layout = { placed: Placed[]; edges: Edge[]; width: number; height: number };

/** Positions every visible card (x, y = top-left) and the elbow connector from each manager to each report. */
export function layout(roots: TreeNode[], collapsed: Set<string>): Layout {
  const widthCache = new Map<string, number>();
  const open = (n: TreeNode) => n.children.length > 0 && !collapsed.has(n.agent.id);
  const width = (n: TreeNode): number => {
    const hit = widthCache.get(n.agent.id);
    if (hit !== undefined) return hit;
    const w = open(n)
      ? Math.max(NODE_W, n.children.reduce((s, c) => s + width(c), 0) + GAP_X * (n.children.length - 1))
      : NODE_W;
    widthCache.set(n.agent.id, w);
    return w;
  };
  const placed: Placed[] = [];
  const edges: Edge[] = [];
  let height = 0;
  const place = (n: TreeNode, left: number) => {
    const w = width(n);
    const cx = left + w / 2;
    const y = n.depth * (NODE_H + GAP_Y);
    height = Math.max(height, y + NODE_H);
    placed.push({ node: n, x: cx - NODE_W / 2, y, open: open(n) });
    if (!open(n)) return;
    const total = n.children.reduce((s, c) => s + width(c), 0) + GAP_X * (n.children.length - 1);
    let cl = left + (w - total) / 2;
    for (const c of n.children) {
      const cw = width(c);
      edges.push({ from: n.agent.id, to: c.agent.id, d: elbow(cx, y + NODE_H, cl + cw / 2, y + NODE_H + GAP_Y) });
      place(c, cl);
      cl += cw + GAP_X;
    }
  };
  let left = 0;
  for (const r of roots) {
    place(r, left);
    left += width(r) + ROOT_GAP;
  }
  return { placed, edges, width: Math.max(0, left - ROOT_GAP), height };
}

/** Down from the manager, across the bus, down into the report, with soft rounded corners. */
function elbow(x1: number, y1: number, x2: number, y2: number): string {
  const mid = y1 + (y2 - y1) / 2;
  if (Math.abs(x2 - x1) < 1) return `M${x1} ${y1}V${y2}`;
  const r = Math.min(CORNER, Math.abs(x2 - x1) / 2, (y2 - y1) / 2);
  const dir = x2 > x1 ? 1 : -1;
  return `M${x1} ${y1}V${mid - r}Q${x1} ${mid} ${x1 + dir * r} ${mid}H${x2 - dir * r}Q${x2} ${mid} ${x2} ${mid + r}V${y2}`;
}

/** The agent itself, everyone above it and everyone below it: what a hover highlights. */
export function lineage(roots: TreeNode[], id: string): Set<string> {
  const out = new Set<string>();
  const down = (n: TreeNode) => {
    out.add(n.agent.id);
    n.children.forEach(down);
  };
  const find = (n: TreeNode, path: string[]): boolean => {
    if (n.agent.id === id) {
      path.forEach((p) => out.add(p));
      down(n);
      return true;
    }
    return n.children.some((c) => find(c, [...path, n.agent.id]));
  };
  roots.some((r) => find(r, []));
  return out;
}

/** Flat index: id -> node and id -> manager node, for the detail panel. */
export function index(roots: TreeNode[]) {
  const nodes = new Map<string, TreeNode>();
  const manager = new Map<string, TreeNode | null>();
  const walk = (n: TreeNode, p: TreeNode | null) => {
    nodes.set(n.agent.id, n);
    manager.set(n.agent.id, p);
    n.children.forEach((c) => walk(c, n));
  };
  roots.forEach((r) => walk(r, null));
  return { nodes, manager };
}

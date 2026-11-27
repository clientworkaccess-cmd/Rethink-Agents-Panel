"use client";
// Team tab: who manages whom. Reporting lines come from Paperclip (/api/org: the `/org` tree, or each agent's
// `reportsTo`); status comes from the same agents + live-runs poll as the Office, so both always agree.
// Desktop: a top-down org chart you can pan and zoom. Below 768px: an indented, collapsible tree list.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { activityOf, bubbleText, roleLabel, runFor } from "@/lib/agents";
import { api, isUnreachable, usePoll } from "@/lib/client";
import type { Activity, Agent, AgentsPayload, LiveRun, OrgPayload } from "@/lib/types";
import Critter from "../character/Critter";
import { ActivityStatus, Badge, EmptyState, Icon, IconButton, InlineNotice, Loading, PageHeader, Unreachable, cx } from "../ui";
import AgentPanel from "./AgentPanel";
import { NODE_H, NODE_W, buildTree, index, layout, lineage, type TreeNode } from "./layout";
import { moodFor } from "./mood";

const COLLAPSE_KEY = "team-collapsed";
const MIN_K = 0.3;
const MAX_K = 1.6;
const PAD = 32;

type View = { x: number; y: number; k: number };

function readCollapsed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(COLLAPSE_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}
function saveCollapsed(s: Set<string>) {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...s]));
  } catch {
    // per-browser convenience only
  }
}

export default function OrgChart() {
  const [data, setData] = useState<AgentsPayload | null>(null);
  const [org, setOrg] = useState<OrgPayload | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  // nothing is rendered from this before data arrives, so reading localStorage here cannot cause a hydration mismatch
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);
  const [hover, setHover] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    try {
      setData(await api<AgentsPayload>("/api/agents"));
      setUnreachable(false);
    } catch (e) {
      if (isUnreachable(e)) setUnreachable(true);
    }
  }, []);
  usePoll(loadAgents, 5000);

  const loadOrg = useCallback(async () => {
    try {
      setOrg(await api<OrgPayload>("/api/org"));
    } catch {
      // keep the last tree; without one it builds from each agent's reportsTo
    }
  }, []);
  usePoll(loadOrg, 30_000);

  const runs = useMemo(() => data?.liveRuns ?? [], [data]);
  const agents = useMemo(() => (data?.agents ?? []).filter((a) => a.status !== "terminated"), [data]);
  const roots = useMemo(() => buildTree(agents, org?.parents ?? null), [agents, org]);
  const idx = useMemo(() => index(roots), [roots]);
  const actOf = useCallback((a: Agent) => activityOf(a, runs), [runs]);

  const toggle = useCallback((id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      saveCollapsed(next);
      return next;
    });
  }, []);
  const setAll = useCallback(
    (collapse: boolean) => {
      const next = new Set<string>(collapse ? [...idx.nodes.values()].filter((n) => n.children.length && n.depth > 0).map((n) => n.agent.id) : []);
      saveCollapsed(next);
      setCollapsed(next);
    },
    [idx],
  );
  const closePanel = useCallback(() => setSelected(null), []);

  if (unreachable && !data) return <Unreachable onRetry={loadAgents} />;
  if (!data) return <Loading label="Drawing the org chart…" />;

  const managers = [...idx.nodes.values()].filter((n) => n.children.length).length;
  const working = agents.filter((a) => actOf(a) === "working").length;
  const sel = selected ? idx.nodes.get(selected) : undefined;

  return (
    <div className="relative flex h-full flex-col">
      <PageHeader
        title="Team"
        meta={
          <>
            {agents.length} agents · {managers} {managers === 1 ? "manager" : "managers"} · {working} working
          </>
        }
      />
      {unreachable && (
        <InlineNotice tone="warning" className="mx-4 mt-3 sm:mx-6">
          Paperclip is not reachable. Showing the last data we had.
        </InlineNotice>
      )}
      {agents.length === 0 ? (
        <EmptyState title="No agents yet" text="When agents are added in Paperclip, they appear here with who they report to." />
      ) : (
        <>
          <Canvas
            roots={roots}
            runs={runs}
            collapsed={collapsed}
            hover={hover}
            selected={selected}
            onHover={setHover}
            onSelect={setSelected}
            onToggle={toggle}
            onSetAll={setAll}
            actOf={actOf}
          />
          <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-4 py-4 md:hidden">
            <ul className="flex flex-col gap-1" aria-label="Team">
              {roots.map((r) => (
                <ListNode key={r.agent.id} node={r} runs={runs} collapsed={collapsed} onToggle={toggle} onSelect={setSelected} actOf={actOf} />
              ))}
            </ul>
          </div>
        </>
      )}
      {sel && (
        <AgentPanel
          key={sel.agent.id}
          agent={sel.agent}
          activity={actOf(sel.agent)}
          run={runFor(sel.agent.id, runs)}
          manager={idx.manager.get(sel.agent.id)?.agent ?? null}
          reports={sel.children.map((c) => c.agent)}
          activityOf={actOf}
          onSelect={setSelected}
          onClose={closePanel}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- desktop chart */

type CanvasProps = {
  roots: TreeNode[];
  runs: LiveRun[];
  collapsed: Set<string>;
  hover: string | null;
  selected: string | null;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
  onSetAll: (collapse: boolean) => void;
  actOf: (a: Agent) => Activity;
};

function Canvas({ roots, runs, collapsed, hover, selected, onHover, onSelect, onToggle, onSetAll, actOf }: CanvasProps) {
  const box = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<View | null>(null);
  const viewRef = useRef<View | null>(null);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);
  const lay = useMemo(() => layout(roots, collapsed), [roots, collapsed]);
  const focus = hover ?? selected;
  const lit = useMemo(() => (focus ? lineage(roots, focus) : null), [roots, focus]);
  const working = useMemo(() => new Set(runs.map((r) => r.agentId)), [runs]);

  const fit = useCallback(() => {
    const el = box.current;
    if (!el || !lay.width) return;
    const { clientWidth: cw, clientHeight: ch } = el;
    const k = Math.max(MIN_K, Math.min(1, (cw - PAD * 2) / lay.width, (ch - PAD * 2) / lay.height));
    setView({ k, x: (cw - lay.width * k) / 2, y: Math.max(PAD, (ch - lay.height * k) / 2) });
  }, [lay]);

  // fit once the first layout is known (later polls keep the user's pan/zoom)
  const fitted = useRef(false);
  useEffect(() => {
    if (!fitted.current && lay.width) {
      fitted.current = true;
      fit();
    }
  }, [lay, fit]);

  const zoomAt = useCallback((factor: number, mx?: number, my?: number) => {
    const el = box.current;
    const v = viewRef.current;
    if (!el || !v) return;
    const px = mx ?? el.clientWidth / 2;
    const py = my ?? el.clientHeight / 2;
    const k = Math.max(MIN_K, Math.min(MAX_K, v.k * factor));
    setView({ k, x: px - (px - v.x) * (k / v.k), y: py - (py - v.y) * (k / v.k) });
  }, []);

  // wheel zoom around the cursor (non-passive so the page does not scroll)
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // drag to pan, two fingers to pinch
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<number | null>(null);
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("[data-org-node],button")) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    pinch.current = null;
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const pts = pointers.current;
    if (pts.size === 2) {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...pts.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const r = box.current!.getBoundingClientRect();
      if (pinch.current) zoomAt(dist / pinch.current, (a.x + b.x) / 2 - r.left, (a.y + b.y) / 2 - r.top);
      pinch.current = dist;
      return;
    }
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    setView((v) => (v ? { ...v, x: v.x + e.clientX - prev.x, y: v.y + e.clientY - prev.y } : v));
  };
  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    pinch.current = null;
  };

  const anyCollapsible = lay.placed.some((p) => p.node.children.length && p.node.depth > 0);
  const anyCollapsed = collapsed.size > 0;
  const multiRoot = roots.length > 1;

  return (
    <div
      ref={box}
      className="org-canvas relative hidden min-h-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing md:block"
      style={view ? { backgroundPosition: `${view.x}px ${view.y}px` } : undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      aria-label="Org chart"
      role="tree"
    >
      {view && (
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})`, width: lay.width, height: lay.height }}
        >
          <svg className="pointer-events-none absolute left-0 top-0 overflow-visible" width={lay.width} height={lay.height} aria-hidden>
            {lay.edges.map((e) => {
              const on = !lit || (lit.has(e.from) && lit.has(e.to));
              return (
                <path
                  key={`${e.from}-${e.to}`}
                  d={e.d}
                  fill="none"
                  stroke={on && lit ? "var(--foreground)" : "var(--control-border)"}
                  strokeOpacity={on ? 1 : 0.35}
                  strokeWidth={on && lit ? 1.75 : 1.5}
                  strokeLinecap="round"
                  className="transition-[stroke-opacity] duration-(--motion-duration-base)"
                />
              );
            })}
            {lay.edges
              .filter((e) => working.has(e.to))
              .map((e) => (
                <path key={`flow-${e.to}`} d={e.d} fill="none" stroke="var(--status-working)" strokeWidth={2} strokeLinecap="round" className="org-flow" />
              ))}
          </svg>
          {lay.placed.map((p, i) => {
            const a = p.node.agent;
            const dim = lit ? !lit.has(a.id) : false;
            const orphan = multiRoot && p.node.depth === 0 && p.node.children.length === 0 && i > 0;
            return (
              <div
                key={a.id}
                className="absolute"
                style={{ left: p.x, top: p.y, width: NODE_W, height: NODE_H }}
                role="treeitem"
                aria-expanded={p.node.children.length ? p.open : undefined}
                aria-level={p.node.depth + 1}
                aria-selected={selected === a.id}
              >
                {orphan && <p className="label-caps absolute inset-x-0 -top-5 text-center">No manager set</p>}
                <NodeCard
                  node={p.node}
                  activity={actOf(a)}
                  run={runFor(a.id, runs)}
                  dim={dim}
                  selected={selected === a.id}
                  open={p.open}
                  onHover={onHover}
                  onSelect={onSelect}
                  onToggle={onToggle}
                />
              </div>
            );
          })}
        </div>
      )}

      <div className="absolute bottom-4 right-4 flex items-center gap-1 rounded-lg border border-border bg-background p-1 shadow-flyout">
        {anyCollapsible && (
          <IconButton label={anyCollapsed ? "Expand all" : "Collapse all"} onClick={() => onSetAll(!anyCollapsed)}>
            <Icon name={anyCollapsed ? "expand" : "restore"} />
          </IconButton>
        )}
        <IconButton label="Zoom out" onClick={() => zoomAt(1 / 1.2)}>
          <Icon name="minus" />
        </IconButton>
        <IconButton label="Zoom in" onClick={() => zoomAt(1.2)}>
          <Icon name="plus" />
        </IconButton>
        <IconButton label="Fit to screen" onClick={fit}>
          <Icon name="fit" />
        </IconButton>
      </div>
    </div>
  );
}

function NodeCard({
  node,
  activity,
  run,
  dim,
  selected,
  open,
  onHover,
  onSelect,
  onToggle,
}: {
  node: TreeNode;
  activity: Activity;
  run: LiveRun | undefined;
  dim: boolean;
  selected: boolean;
  open: boolean;
  onHover: (id: string | null) => void;
  onSelect: (id: string) => void;
  onToggle: (id: string) => void;
}) {
  const a = node.agent;
  const subtitle = a.title || roleLabel(a);
  const reports = node.children.length;
  const task = run?.issueTitle ? bubbleText(run.issueTitle, 5) : "";
  return (
    <div
      className="org-enter relative h-full"
      style={{ animationDelay: `calc(var(--motion-stagger) * ${node.depth * 4})` }}
      onMouseEnter={() => onHover(a.id)}
      onMouseLeave={() => onHover(null)}
    >
      <button
        type="button"
        data-org-node
        onClick={() => onSelect(a.id)}
        onFocus={() => onHover(a.id)}
        onBlur={() => onHover(null)}
        className={cx(
          "flex h-full w-full flex-col justify-between rounded-lg border bg-background p-3 text-left shadow-flyout transition-[opacity,border-color,transform] duration-(--motion-duration-base) hover:-translate-y-0.5",
          selected ? "border-foreground" : activity === "working" ? "border-status-working" : "border-border",
          dim && "opacity-40",
        )}
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 rounded-full bg-muted p-1">
            <Critter agent={a} size={40} head mood={moodFor(activity)} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">{a.name}</span>
            {subtitle && <span className="block truncate text-xs">{subtitle}</span>}
          </span>
        </span>
        <span className="flex min-w-0 items-center justify-between gap-2">
          <ActivityStatus activity={activity} />
          {task && <span className="shimmer min-w-0 truncate text-xs">{task}</span>}
        </span>
      </button>
      {reports > 0 && (
        <button
          type="button"
          onClick={() => onToggle(a.id)}
          aria-label={open ? `Hide ${a.name}'s team` : `Show ${a.name}'s team (${reports})`}
          title={open ? "Hide team" : "Show team"}
          className="absolute -bottom-3 left-1/2 flex h-tab-compact -translate-x-1/2 items-center gap-1 rounded-full border border-border bg-background px-2 text-xs text-foreground shadow-flyout transition-colors duration-(--motion-duration-fast) hover:bg-muted-highlight"
        >
          <Icon name={open ? "chevronDown" : "chevronRight"} className="size-icon-sm" />
          <span className="font-mono tabular-nums">{open ? reports : node.descendants}</span>
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- mobile list */

function ListNode({
  node,
  runs,
  collapsed,
  onToggle,
  onSelect,
  actOf,
}: {
  node: TreeNode;
  runs: LiveRun[];
  collapsed: Set<string>;
  onToggle: (id: string) => void;
  onSelect: (id: string) => void;
  actOf: (a: Agent) => Activity;
}) {
  const a = node.agent;
  const open = node.children.length > 0 && !collapsed.has(a.id);
  const activity = actOf(a);
  const run = runFor(a.id, runs);
  return (
    <li className="org-enter" style={{ animationDelay: `calc(var(--motion-stagger) * ${node.depth * 4})` }}>
      <div className="flex items-center gap-1">
        {node.children.length ? (
          <IconButton label={open ? `Hide ${a.name}'s team` : `Show ${a.name}'s team`} onClick={() => onToggle(a.id)}>
            <Icon name={open ? "chevronDown" : "chevronRight"} />
          </IconButton>
        ) : (
          <span className="w-btn-sm shrink-0" aria-hidden />
        )}
        <button
          type="button"
          onClick={() => onSelect(a.id)}
          className="flex min-w-0 flex-1 items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors duration-(--motion-duration-fast) hover:bg-muted-highlight"
        >
          <Critter agent={a} size={32} head mood={moodFor(activity)} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-foreground">{a.name}</span>
            <span className="block truncate text-xs">
              {run?.issueTitle ? bubbleText(run.issueTitle, 5) : a.title || roleLabel(a) || "Agent"}
            </span>
          </span>
          <ActivityStatus activity={activity} />
          {node.children.length > 0 && <Badge>{node.children.length}</Badge>}
        </button>
      </div>
      {open && (
        <ul className="ml-org-indent flex flex-col gap-1 border-l border-border pl-1">
          {node.children.map((c) => (
            <ListNode key={c.agent.id} node={c} runs={runs} collapsed={collapsed} onToggle={onToggle} onSelect={onSelect} actOf={actOf} />
          ))}
        </ul>
      )}
    </li>
  );
}

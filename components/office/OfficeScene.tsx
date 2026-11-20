"use client";
// The Office scene: room + one animated character per agent, with a camera. Lazy-loaded by Office.tsx (PixiJS
// lives in its own chunk). Pauses while the tab is hidden.
//
// Camera: the room opens fitted to the screen, but never below OPEN_FLOOR (0.85) so names and faces stay
// legible. When that floor applies (big teams, small screens) it opens centred horizontally and top-aligned,
// the wheel pans (ctrl+wheel and pinch zoom), and panning is clamped so the room edge never leaves the
// viewport edge. Zooming out still reaches the true whole-room fit. "Reset view" returns to the opening view.
import { Container, Rectangle } from "pixi.js";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { CharacterBrain } from "@/components/character/brain";
import { lookFor } from "@/components/character/model";
import { CharacterRig } from "@/components/character/rig";
import { createStage, type Stage } from "@/components/character/stage";
import { activityOf, bubbleText, isThinking, runFor } from "@/lib/agents";
import { activityHex, sceneChrome } from "@/lib/tokens";
import { currentTheme, onThemeChange, prefersReducedMotion } from "@/lib/theme";
import type { Agent, LiveRun } from "@/lib/types";
import { deskLabels } from "./labels";
import { stepsFor } from "./roles";
import { buildRoom, type DeskOwner, type Room } from "./room";
import { buildLayout, Grid, navigatorFor, type Layout } from "./world";

export type OfficeApi = {
  resetView: () => void;
  /** Happy jump + wave (used before leaving for the chat). */
  celebrate: (agentId: string) => void;
  /** Screen position (CSS px, relative to the canvas) just above the agent's head. */
  headPos: (agentId: string) => { x: number; y: number } | null;
  /** Pans the camera so the agent's desk is in view. */
  panTo: (agentId: string) => void;
};

const OPEN_FLOOR = 0.85;
const MARGIN = 20;

type Props = {
  agents: Agent[];
  liveRuns: LiveRun[];
  onSelect: (agentId: string | null) => void;
  onEvent?: (kind: "click" | "done" | "type") => void;
  /** The agent whose card is open (its hover emblem stays hidden). */
  selected?: string | null;
  apiRef?: Ref<OfficeApi>;
};

type Char = { agent: Agent; rig: CharacterRig; brain: CharacterBrain; desk: number; lastGreet: number; prevWorking: boolean; status: string };

export default function OfficeScene({ agents, liveRuns, onSelect, onEvent, selected = null, apiRef }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const data = useRef({ agents, liveRuns });
  const picked = useRef(selected);
  const cbs = useRef({ onSelect, onEvent });
  const ctl = useRef<{ fit: () => void; panTo: (id: string) => void; chars: Map<string, Char>; world: Container | null }>({
    fit: () => {},
    panTo: () => {},
    chars: new Map(),
    world: null,
  });

  useEffect(() => {
    data.current = { agents, liveRuns };
  }, [agents, liveRuns]);
  useEffect(() => {
    cbs.current = { onSelect, onEvent };
  }, [onSelect, onEvent]);
  useEffect(() => {
    picked.current = selected;
  }, [selected]);

  useImperativeHandle(apiRef, () => ({
    resetView: () => ctl.current.fit(),
    celebrate: (id) => ctl.current.chars.get(id)?.brain.wave(),
    headPos: (id) => {
      const c = ctl.current.chars.get(id);
      if (!c || !ctl.current.world) return null;
      const p = c.rig.root.toGlobal({ x: 0, y: -84 });
      return { x: p.x, y: p.y };
    },
    panTo: (id) => ctl.current.panTo(id),
  }));

  useEffect(() => {
    let stage: Stage | null = null;
    let cancelled = false;
    const cleanups: (() => void)[] = [];
    const control = ctl.current;

    (async () => {
      const el = host.current;
      if (!el) return;
      const s = await createStage(el);
      if (cancelled) {
        s.destroy();
        return;
      }
      stage = s;
      const { app } = s;
      const world = new Container();
      const sorted = new Container();
      sorted.sortableChildren = true;
      app.stage.addChild(world);
      ctl.current.world = world;

      const chars = ctl.current.chars;
      chars.clear();
      const desks = new Map<string, number>();
      let layout: Layout = buildLayout(1);
      let grid = new Grid(layout);
      let room: Room | null = null;
      let reduced = prefersReducedMotion();
      let dark = currentTheme() === "dark";

      const rebuildRoom = () => {
        room?.destroy();
        const deskAgents = Array.from({ length: layout.slots }, (_, i) => {
          const owner = [...desks.entries()].find(([, d]) => d === i)?.[0];
          return (owner ? data.current.agents.find((x) => x.id === owner) : null) ?? null;
        });
        const labels = deskLabels(deskAgents);
        const owners: DeskOwner[] = deskAgents.map((a, i) => (a ? { id: a.id, label: labels[i] ?? a.name, color: lookFor(a).color } : null));
        // a tag click behaves like clicking the agent itself
        room = buildRoom(layout, owners, dark, { mono: sceneChrome().fontMono }, (slot, phase) => {
          const a = deskAgents[slot];
          const c = a ? chars.get(a.id) : undefined;
          if (!c) return;
          if (phase === "down") hitChar = true;
          else pickChar(c);
        });
        world.removeChildren();
        world.addChild(room.back, sorted);
        for (const p of room.props) sorted.addChild(p);
        for (const c of chars.values()) {
          c.rig.refreshChrome();
          c.status = "";
          sorted.addChild(c.rig.root);
        }
      };

      // ---------- camera ----------
      let userMoved = false;
      let panAnim: { fx: number; fy: number; tx: number; ty: number; t: number } | null = null;
      /** The true whole-room fit (also the zoom-out minimum). */
      const fitScale = () => Math.min(app.screen.width / (layout.width + MARGIN * 2), app.screen.height / (layout.height + MARGIN * 2));
      const openScale = () => Math.max(fitScale(), OPEN_FLOOR);
      const floorApplies = () => openScale() > fitScale() + 1e-6;
      const clampZoom = (z: number) => {
        const f = fitScale();
        return Math.min(Math.max(f * 2.6, openScale() * 1.8), Math.max(f, z));
      };
      /** Keeps the room edge from passing the viewport edge (and keeps it on screen on an axis where it fits). */
      const clampPan = (x: number, y: number) => {
        const z = world.scale.x;
        const axis = (pos: number, room: number, view: number) => {
          const size = room * z;
          if (size + MARGIN * 2 <= view) return Math.min(view - size - MARGIN, Math.max(MARGIN, pos));
          return Math.min(MARGIN, Math.max(view - size - MARGIN, pos));
        };
        return { x: axis(x, layout.width, app.screen.width), y: axis(y, layout.height, app.screen.height) };
      };
      const setPan = (x: number, y: number) => {
        const p = clampPan(x, y);
        world.position.set(p.x, p.y);
      };
      const fit = () => {
        const z = openScale();
        world.scale.set(z);
        panAnim = null;
        const x = (app.screen.width - layout.width * z) / 2;
        // when the legibility floor applies: top-aligned, so the wall and the first rows are in view
        if (floorApplies()) setPan(x, MARGIN);
        else world.position.set(x, (app.screen.height - layout.height * z) / 2);
        userMoved = false;
      };
      ctl.current.fit = fit;
      ctl.current.panTo = (id: string) => {
        const c = chars.get(id);
        const seat = c ? layout.seats[c.desk] : null;
        if (!seat) return;
        const z = world.scale.x;
        const target = clampPan(app.screen.width / 2 - seat.x * z, app.screen.height / 2 - (seat.y - 50) * z);
        userMoved = true;
        if (reduced) world.position.set(target.x, target.y);
        else panAnim = { fx: world.x, fy: world.y, tx: target.x, ty: target.y, t: 0 };
      };
      const zoomAt = (sx: number, sy: number, factor: number) => {
        const z0 = world.scale.x;
        const z1 = clampZoom(z0 * factor);
        const wx = (sx - world.x) / z0;
        const wy = (sy - world.y) / z0;
        world.scale.set(z1);
        setPan(sx - wx * z1, sy - wy * z1);
        panAnim = null;
        userMoved = true;
      };
      const canvas = app.canvas;
      const pointers = new Map<number, { x: number; y: number }>();
      let drag: { x: number; y: number; wx: number; wy: number; moved: boolean } | null = null;
      let pinch: { d: number } | null = null;
      const local = (e: PointerEvent | WheelEvent) => {
        const r = canvas.getBoundingClientRect();
        return { x: e.clientX - r.left, y: e.clientY - r.top };
      };
      const onDown = (e: PointerEvent) => {
        const p = local(e);
        pointers.set(e.pointerId, p);
        if (pointers.size === 1) drag = { x: p.x, y: p.y, wx: world.x, wy: world.y, moved: false };
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) };
          drag = null;
        }
      };
      const onMove = (e: PointerEvent) => {
        const p = local(e);
        // where the cursor is in world space (for characters that look at it)
        const wp = { x: (p.x - world.x) / world.scale.x, y: (p.y - world.y) / world.scale.y };
        for (const c of chars.values()) if (c.brain.hovered) c.brain.lookAt(wp);
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, p);
        if (pinch && pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinch.d);
          pinch.d = d;
        } else if (drag) {
          const dx = p.x - drag.x;
          const dy = p.y - drag.y;
          if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
          if (drag.moved) {
            panAnim = null;
            setPan(drag.wx + dx, drag.wy + dy);
            userMoved = true;
            canvas.style.cursor = "grabbing";
          }
        }
      };
      const onUp = (e: PointerEvent) => {
        pointers.delete(e.pointerId);
        if (pointers.size < 2) pinch = null;
        if (pointers.size === 0) {
          if (drag && !drag.moved && !hitChar) cbs.current.onSelect(null);
          drag = null;
          canvas.style.cursor = "";
        }
        hitChar = false;
      };
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        const p = local(e);
        // a room bigger than the screen scrolls like a page; ctrl+wheel (and trackpad pinch) still zooms
        if (floorApplies() && !e.ctrlKey) {
          const k = e.deltaMode === 1 ? 16 : 1;
          panAnim = null;
          setPan(world.x - (e.shiftKey ? e.deltaY : e.deltaX) * k, world.y - (e.shiftKey ? 0 : e.deltaY) * k);
          userMoved = true;
          return;
        }
        zoomAt(p.x, p.y, Math.exp(-e.deltaY * (e.ctrlKey ? 0.004 : 0.0015)));
      };
      canvas.addEventListener("pointerdown", onDown);
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
      window.addEventListener("pointercancel", onUp);
      canvas.addEventListener("wheel", onWheel, { passive: false });
      cleanups.push(() => {
        canvas.removeEventListener("pointerdown", onDown);
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        window.removeEventListener("pointercancel", onUp);
        canvas.removeEventListener("wheel", onWheel);
      });
      let hitChar = false;
      /** Click on an agent or its desk tag: it jumps and waves, then its card opens. */
      const pickChar = (ch: Char) => {
        if (drag?.moved) return;
        ch.brain.wave();
        cbs.current.onEvent?.("click");
        setTimeout(() => cbs.current.onSelect(ch.agent.id), 380);
      };

      // ---------- characters ----------
      const sync = () => {
        const visible = data.current.agents.filter((a) => a.status !== "terminated");
        // desks are assigned on first sight and kept, so new agents never reshuffle the room
        let changed = false;
        for (const a of visible) {
          if (desks.has(a.id)) continue;
          const used = new Set(desks.values());
          let i = 0;
          while (used.has(i)) i++;
          desks.set(a.id, i);
          changed = true;
        }
        const need = Math.max(1, ...[...desks.values()].map((d) => d + 1));
        const nextLayout = buildLayout(need);
        if (nextLayout.slots !== layout.slots || !room) {
          layout = nextLayout;
          grid = new Grid(layout);
          for (const c of chars.values()) c.brain.setNavigator(navigatorFor(grid, layout, c.desk));
          rebuildRoom();
          if (!userMoved) fit();
        } else if (changed) rebuildRoom();

        for (const a of visible) {
          let c = chars.get(a.id);
          if (!c) {
            const desk = desks.get(a.id)!;
            const look = lookFor(a);
            const rig = new CharacterRig(look, { label: a.name.toUpperCase() });
            const nav = navigatorFor(grid, layout, desk);
            // agents that appear later walk in from the front-left corner of the room
            const brain = new CharacterBrain(nav, desk, settled ? { ...layout.door } : undefined);
            c = { agent: a, rig, brain, desk, lastGreet: 0, prevWorking: false, status: "" };
            const root = rig.root;
            root.eventMode = "static";
            root.cursor = "pointer";
            root.hitArea = new Rectangle(-22, -86, 44, 98);
            const ch = c;
            root.on("pointerover", () => {
              ch.brain.hovered = true;
            });
            root.on("pointerout", () => {
              ch.brain.hovered = false;
              ch.brain.lookAt(null);
            });
            root.on("pointerdown", () => {
              hitChar = true;
            });
            root.on("pointertap", () => pickChar(ch));
            chars.set(a.id, c);
            sorted.addChild(root);
          }
          c.agent = a;
        }
        for (const [id, c] of chars)
          if (!visible.some((a) => a.id === id)) {
            c.rig.destroy();
            chars.delete(id);
          }
      };
      let settled = false;
      sync();
      settled = data.current.agents.length > 0;
      fit();

      const ro = new ResizeObserver(() => {
        if (!userMoved) fit();
        else setPan(world.x, world.y);
      });
      ro.observe(el);
      cleanups.push(() => ro.disconnect());
      cleanups.push(
        onThemeChange((t) => {
          dark = t === "dark";
          rebuildRoom();
        }),
      );
      const mq = matchMedia("(prefers-reduced-motion: reduce)");
      const onMotion = () => (reduced = mq.matches);
      mq.addEventListener("change", onMotion);
      cleanups.push(() => mq.removeEventListener("change", onMotion));

      let clock = 0;
      let typeTick = 0;
      let syncTick = 0;
      app.ticker.add((ticker) => {
        const dt = Math.min(ticker.deltaMS, 100);
        clock += dt / 1000;
        syncTick += dt;
        if (syncTick > 500) {
          syncTick = 0;
          sync();
        }
        room?.update(clock, reduced);
        if (panAnim) {
          // eased glide to a desk ("N waiting for you")
          panAnim.t = Math.min(1, panAnim.t + dt / 450);
          const k = 1 - (1 - panAnim.t) ** 3;
          world.position.set(panAnim.fx + (panAnim.tx - panAnim.fx) * k, panAnim.fy + (panAnim.ty - panAnim.fy) * k);
          if (panAnim.t >= 1) panAnim = null;
        }
        const { liveRuns: runs } = data.current;
        const now = Date.now();
        let anyTyping = false;
        for (const c of chars.values()) {
          const run = runFor(c.agent.id, runs);
          const activity = activityOf(c.agent, runs);
          const working = activity === "working";
          if (c.prevWorking && !working && activity !== "error") cbs.current.onEvent?.("done");
          // the status dot on the cubicle tag follows the agent's activity
          if (c.status !== activity) {
            c.status = activity;
            room?.setStatus(c.desk, activityHex(activity));
          }
          c.prevWorking = working;
          c.brain.cardOpen = picked.current === c.agent.id;
          const pose = c.brain.update(dt, {
            activity,
            thinking: working && isThinking(run, now),
            task: bubbleText(run?.issueTitle ?? "Working on a task"),
            steps: stepsFor(c.agent.role, c.agent.name),
            reduced,
          });
          if (c.brain.state === "work") anyTyping = true;
          c.rig.apply(pose, dt, reduced);
          c.rig.setBubble(c.brain.bubble.kind, c.brain.bubble.text);
          const r = c.rig.root;
          // the cubicle tag names a seated agent; the name rides along when it leaves its desk
          const home = layout.seats[c.desk];
          c.rig.setLabelVisible(!home || Math.hypot(c.brain.pos.x - home.x, c.brain.pos.y - home.y) > 4 || c.brain.hovered);
          r.position.set(c.brain.pos.x, c.brain.pos.y);
          r.zIndex = c.brain.pos.y + 0.5;
          const target = c.brain.hovered ? 1.08 : 1;
          r.scale.set(r.scale.x + (target - r.scale.x) * Math.min(1, dt / 80));
        }
        // characters greet each other when they pass
        if (!reduced) {
          const list = [...chars.values()];
          for (let i = 0; i < list.length; i++)
            for (let j = i + 1; j < list.length; j++) {
              const a = list[i];
              const b = list[j];
              if (!a.brain.walking && !b.brain.walking) continue;
              if (Math.hypot(a.brain.pos.x - b.brain.pos.x, a.brain.pos.y - b.brain.pos.y) > 70) continue;
              if (clock - a.lastGreet < 12 || clock - b.lastGreet < 12) continue;
              a.lastGreet = b.lastGreet = clock;
              a.brain.greet();
              b.brain.greet();
            }
        }
        typeTick += dt;
        if (anyTyping && typeTick > 260) {
          typeTick = 0;
          if (Math.random() < 0.5) cbs.current.onEvent?.("type");
        }
      });
    })();

    return () => {
      cancelled = true;
      for (const c of cleanups) c();
      control.chars.clear();
      control.world = null;
      stage?.destroy();
    };
  }, []);

  return <div ref={host} className="absolute inset-0" aria-label="Office scene with the agent team" role="img" />;
}

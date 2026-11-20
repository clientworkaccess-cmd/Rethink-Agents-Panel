"use client";
// A row of standing characters (no walking): the Chat lobby lounge, the Dashboard team strip and the
// animated avatar in the chat sidebar all use this. Same rig + brain as the Office. Lazy-load it.
import { Container, Graphics, Rectangle } from "pixi.js";
import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import { ACTIVITY_HEX, bubbleText } from "@/lib/agents";
import { currentTheme, onThemeChange, prefersReducedMotion } from "@/lib/theme";
import type { Activity, Agent } from "@/lib/types";
import { stepsFor } from "@/components/office/roles";
import { CharacterBrain } from "./brain";
import { lookFor, mix } from "./model";
import { CharacterRig } from "./rig";
import { createStage, type Stage } from "./stage";

export type CrewMember = { agent: Agent; activity: Activity; thinking?: boolean; task?: string | null };

export type CrewApi = {
  wave: (id: string) => void;
  /** Hop toward the camera (used before entering a chat). */
  hop: (id: string) => void;
  headPos: (id: string) => { x: number; y: number } | null;
};

type Props = {
  members: CrewMember[];
  decor?: "lounge" | "none";
  labels?: boolean;
  rings?: boolean;
  bubbles?: boolean;
  /** Character height in CSS px at most. */
  maxHeight?: number;
  onPick?: (id: string) => void;
  apiRef?: Ref<CrewApi>;
};

type Member = { id: string; rig: CharacterRig; brain: CharacterBrain; hop: number; data: CrewMember };

export default function CrewScene({ members, decor = "none", labels = false, rings = false, bubbles = true, maxHeight = 150, onPick, apiRef }: Props) {
  const host = useRef<HTMLDivElement>(null);
  const data = useRef(members);
  const pick = useRef(onPick);
  const ctl = useRef<{ map: Map<string, Member> }>({ map: new Map() });

  useEffect(() => {
    data.current = members;
  }, [members]);
  useEffect(() => {
    pick.current = onPick;
  }, [onPick]);

  useImperativeHandle(apiRef, () => ({
    wave: (id) => ctl.current.map.get(id)?.brain.wave(),
    hop: (id) => {
      const m = ctl.current.map.get(id);
      if (m) {
        m.brain.wave();
        m.hop = 0.001;
      }
    },
    headPos: (id) => {
      const m = ctl.current.map.get(id);
      if (!m) return null;
      const p = m.rig.root.toGlobal({ x: 0, y: -84 });
      return { x: p.x, y: p.y };
    },
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
      const deco = new Graphics();
      const row = new Container();
      row.sortableChildren = true;
      app.stage.addChild(deco, row);
      const map = ctl.current.map;
      map.clear();
      let dark = currentTheme() === "dark";
      let reduced = prefersReducedMotion();
      let scale = 1;
      const cursor = { x: 0, y: 0 };

      const drawDecor = () => {
        deco.clear();
        if (decor !== "lounge") return;
        const w = app.screen.width;
        const h = app.screen.height;
        const base = h * 0.78;
        const floor = dark ? 0x221d2c : 0xf3eee7;
        const rug = dark ? 0x2c2545 : 0xece6ff;
        const sofa = dark ? 0x3d3456 : 0xd9cffc;
        deco.rect(0, base - 30 * scale, w, h).fill(floor);
        deco.ellipse(w / 2, base + 4, Math.min(w * 0.42, 520), 34 * scale).fill(rug);
        // sofa behind the crew
        const sw = Math.min(w * 0.7, 760);
        deco.roundRect(w / 2 - sw / 2, base - 112 * scale, sw, 64 * scale, 14 * scale).fill(sofa);
        deco.roundRect(w / 2 - sw / 2 - 18 * scale, base - 92 * scale, 30 * scale, 58 * scale, 10 * scale).fill(mix(sofa, 0x000000, 0.08));
        deco.roundRect(w / 2 + sw / 2 - 12 * scale, base - 92 * scale, 30 * scale, 58 * scale, 10 * scale).fill(mix(sofa, 0x000000, 0.08));
        // floor lamp + plant
        const lx = Math.max(40, w / 2 - sw / 2 - 70 * scale);
        deco.rect(lx - 1.5, base - 150 * scale, 3, 150 * scale).fill(dark ? 0x5a5270 : 0xb7b0c8);
        deco.roundRect(lx - 18 * scale, base - 168 * scale, 36 * scale, 22 * scale, 6).fill(dark ? 0xffe2a8 : 0xfff3d6);
        if (dark) deco.circle(lx, base - 150 * scale, 90 * scale).fill({ color: 0xffd27a, alpha: 0.07 });
        const px = Math.min(w - 40, w / 2 + sw / 2 + 70 * scale);
        deco.roundRect(px - 14 * scale, base - 22 * scale, 28 * scale, 24 * scale, 4).fill(dark ? 0x9c6b5a : 0xe9a58a);
        for (const [dx, dy, r] of [
          [-10, -34, 12],
          [9, -38, 13],
          [0, -54, 12],
        ])
          deco.circle(px + dx * scale, base + dy * scale, r * scale).fill(dark ? 0x4f8f62 : 0x7cc58f);
        if (dark) {
          // a few stars on the wall: night lounge
          for (let i = 0; i < 18; i++) deco.circle((i * 97) % w, 12 + ((i * 53) % Math.max(20, base - 190 * scale)), i % 3 ? 0.8 : 1.4).fill({ color: 0xffffff, alpha: 0.5 });
        }
      };

      const layoutRow = () => {
        const list = [...map.values()];
        const w = app.screen.width;
        const h = app.screen.height;
        const n = Math.max(1, list.length);
        const labelRoom = labels ? 22 : 6;
        scale = Math.min((h - labelRoom - 8) / 104, maxHeight / 104, (w / n) / 70);
        scale = Math.max(0.3, scale);
        const base = decor === "lounge" ? h * 0.78 : h - labelRoom;
        const gap = Math.min(w / n, 150 * scale);
        list.forEach((m, i) => {
          m.rig.root.position.set(w / 2 + (i - (n - 1) / 2) * gap, base);
          m.brain.pos = { x: m.rig.root.x, y: m.rig.root.y };
        });
        drawDecor();
      };

      const sync = () => {
        const next = data.current;
        let changed = false;
        for (const mem of next) {
          let m = map.get(mem.agent.id);
          if (!m) {
            const rig = new CharacterRig(lookFor(mem.agent), {
              label: labels ? mem.agent.name.toUpperCase() : undefined,
              labelColor: dark ? 0xcdc8d8 : 0x5d5d5d,
              ring: rings ? ACTIVITY_HEX[mem.activity] : null,
            });
            const brain = new CharacterBrain(null, map.size);
            m = { id: mem.agent.id, rig, brain, hop: 0, data: mem };
            const root = rig.root;
            if (pick.current) {
              root.eventMode = "static";
              root.cursor = "pointer";
              root.hitArea = new Rectangle(-24, -90, 48, 104);
              const mm = m;
              root.on("pointerover", () => (mm.brain.hovered = true));
              root.on("pointerout", () => {
                mm.brain.hovered = false;
                mm.brain.lookAt(null);
              });
              root.on("pointertap", () => {
                mm.brain.wave();
                pick.current?.(mm.id);
              });
            }
            row.addChild(root);
            map.set(mem.agent.id, m);
            changed = true;
          }
          if (rings && m.data.activity !== mem.activity) m.rig.setRing(ACTIVITY_HEX[mem.activity]);
          m.data = mem;
        }
        for (const [id, m] of map)
          if (!next.some((x) => x.agent.id === id)) {
            m.rig.destroy();
            map.delete(id);
            changed = true;
          }
        if (changed) layoutRow();
      };
      sync();
      layoutRow();

      const ro = new ResizeObserver(() => layoutRow());
      ro.observe(el);
      cleanups.push(() => ro.disconnect());
      cleanups.push(
        onThemeChange((t) => {
          dark = t === "dark";
          for (const m of map.values()) m.rig.setLabelColor(dark ? 0xcdc8d8 : 0x5d5d5d);
          drawDecor();
        }),
      );
      const mq = matchMedia("(prefers-reduced-motion: reduce)");
      const onMotion = () => (reduced = mq.matches);
      mq.addEventListener("change", onMotion);
      cleanups.push(() => mq.removeEventListener("change", onMotion));
      const onMove = (e: PointerEvent) => {
        const r = app.canvas.getBoundingClientRect();
        cursor.x = e.clientX - r.left;
        cursor.y = e.clientY - r.top;
        for (const m of map.values())
          if (m.brain.hovered) m.brain.lookAt({ x: m.brain.pos.x + (cursor.x - m.rig.root.x) / scale, y: m.brain.pos.y + (cursor.y - m.rig.root.y) / scale });
      };
      window.addEventListener("pointermove", onMove);
      cleanups.push(() => window.removeEventListener("pointermove", onMove));

      let syncTick = 0;
      app.ticker.add((ticker) => {
        const dt = Math.min(ticker.deltaMS, 100);
        syncTick += dt;
        if (syncTick > 400) {
          syncTick = 0;
          sync();
        }
        for (const m of map.values()) {
          const d = m.data;
          const pose = m.brain.update(dt, {
            activity: d.activity,
            thinking: !!d.thinking,
            task: bubbleText(d.task ?? (d.activity === "working" ? "Working on a task" : "")),
            steps: stepsFor(d.agent.role, d.agent.name),
            reduced,
          });
          m.rig.apply(pose, dt, reduced);
          m.rig.setBubble(bubbles ? m.brain.bubble.kind : null, m.brain.bubble.text);
          let s = scale * (m.brain.hovered ? 1.08 : 1);
          if (m.hop > 0) {
            m.hop = Math.min(1, m.hop + dt / 520);
            s *= 1 + m.hop * 0.7;
            m.rig.root.alpha = 1 - Math.max(0, m.hop - 0.6) * 1.5;
          }
          const cur = m.rig.root.scale.x;
          m.rig.root.scale.set(cur + (s - cur) * Math.min(1, dt / 70));
          m.rig.root.zIndex = m.hop > 0 ? 10 : 0;
        }
      });
    })();
    return () => {
      cancelled = true;
      for (const c of cleanups) c();
      control.map.clear();
      stage?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={host} className="absolute inset-0" />;
}

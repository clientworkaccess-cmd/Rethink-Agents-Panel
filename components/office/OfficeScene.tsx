"use client";
// The 2D office, drawn with PixiJS Graphics (all art is original, made here). Lazy-loaded by Office.tsx.
import { Application, extend, useApplication, useTick } from "@pixi/react";
import { Container, Graphics, Rectangle, Text, type Ticker } from "pixi.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ACTIVITY_HEX, agentColor } from "@/lib/agents";
import type { Activity, Agent } from "@/lib/types";
import { Brain } from "./brain";
import { COLS, deskAt, sceneHeight, W, WALL_H } from "./layout";
import { stepsFor } from "./roles";

extend({ Container, Graphics, Text });

export type SceneAgent = { agent: Agent; activity: Activity };
export type Pointer = { agentId: string; x: number; y: number };

const INK = 0x27251e;
const PAPER = 0xfdfbfa;
const MIST = 0xd1d1cd;
const TEAL = 0x016a71;
const WOOD = 0xd8b98c;
const WOOD_EDGE = 0xb9966a;
const SKIN = [0xf1d3b3, 0xe0b48f, 0xc68e64, 0x9c6b47];
const HAIR = [0x3b2f2a, 0x6b4a32, 0x2f2b28, 0x8a6a4a, 0x5a4a3f];

function pickBy(id: string, list: number[]) {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return list[h % list.length];
}

export default function OfficeScene({
  agents,
  onHover,
  onSelect,
}: {
  agents: SceneAgent[];
  onHover: (p: Pointer | null) => void;
  onSelect: (p: Pointer) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(W);

  // Desks are assigned on first sight and kept, so new agents never reshuffle the room.
  const [desks, setDesks] = useState<Record<string, number>>({});
  let deskMap = desks;
  if (agents.some(({ agent }) => !(agent.id in desks))) {
    deskMap = { ...desks };
    for (const { agent } of agents) {
      if (agent.id in deskMap) continue;
      const used = new Set(Object.values(deskMap));
      let i = 0;
      while (used.has(i)) i++;
      deskMap[agent.id] = i;
    }
    setDesks(deskMap);
  }
  const deskCount = Math.max(COLS, ...Object.values(deskMap).map((i) => i + 1));
  const slots = Math.ceil(deskCount / COLS) * COLS;
  const height = sceneHeight(slots);
  const scale = width / W;

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setWidth(Math.max(320, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  return (
    <div ref={wrap} className="w-full">
      <div ref={box} style={{ height: height * scale }} className="relative w-full overflow-hidden rounded-2xl">
        <Application resizeTo={box} background={0xf3ece0} antialias autoDensity resolution={typeof window === "undefined" ? 1 : Math.min(2, window.devicePixelRatio || 1)}>
          <PauseWhenHidden />
          <pixiContainer scale={scale} sortableChildren>
            <Room height={height} />
            {Array.from({ length: slots }, (_, i) => (
              <Desk key={`desk-${i}`} index={i} />
            ))}
            {agents.map(({ agent, activity }) => (
              <Character
                key={agent.id}
                agent={agent}
                activity={activity}
                deskIndex={deskMap[agent.id] ?? 0}
                scale={scale}
                onHover={onHover}
                onSelect={onSelect}
              />
            ))}
          </pixiContainer>
        </Application>
      </div>
    </div>
  );
}

/** Stops the animation loop while the browser tab is hidden. */
function PauseWhenHidden() {
  const { app } = useApplication();
  useEffect(() => {
    const onVis = () => {
      if (!app?.ticker) return;
      if (document.hidden) app.ticker.stop();
      else app.ticker.start();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [app]);
  return null;
}

function Room({ height }: { height: number }) {
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      // floor with soft planks
      g.rect(0, WALL_H, W, height - WALL_H).fill(0xeee4d3);
      for (let y = WALL_H + 30; y < height; y += 30) g.rect(0, y, W, 1).fill({ color: INK, alpha: 0.04 });
      // wall + baseboard
      g.rect(0, 0, W, WALL_H).fill(0xf4efe6);
      g.rect(0, WALL_H - 6, W, 6).fill(0xdcd0bc);

      // chart wall
      g.roundRect(70, 20, 200, 76, 8).fill(PAPER).stroke({ width: 1.5, color: MIST });
      const bars = [26, 38, 31, 46, 52];
      bars.forEach((h, i) => g.roundRect(88 + i * 22, 86 - h, 14, h, 2).fill(i === bars.length - 1 ? TEAL : 0xb9b5ab));
      g.moveTo(206, 76).lineTo(222, 62).lineTo(236, 68).lineTo(254, 40).stroke({ width: 2, color: 0x72706b, cap: "round", join: "round" });
      g.circle(254, 40, 3).fill(TEAL);

      // whiteboard
      g.roundRect(330, 22, 180, 72, 6).fill(PAPER).stroke({ width: 3, color: 0xbdb7ab });
      g.moveTo(348, 42).lineTo(420, 42).stroke({ width: 2, color: 0x72706b, alpha: 0.5, cap: "round" });
      g.moveTo(348, 56).lineTo(470, 56).stroke({ width: 2, color: 0x72706b, alpha: 0.35, cap: "round" });
      g.moveTo(348, 70).lineTo(440, 70).stroke({ width: 2, color: TEAL, alpha: 0.5, cap: "round" });
      g.roundRect(380, 94, 80, 4, 2).fill(0xbdb7ab);

      // window
      g.roundRect(566, 24, 84, 64, 6).fill(0xe9eef0).stroke({ width: 3, color: 0xdcd0bc });
      g.rect(607, 24, 2, 64).fill(0xdcd0bc);
      g.rect(566, 55, 84, 2).fill(0xdcd0bc);

      // campaign / poster board (cork)
      g.roundRect(690, 20, 180, 76, 8).fill(0xd9bb93).stroke({ width: 1.5, color: 0xc4a37a });
      [
        [706, 32, 44, 36],
        [758, 30, 48, 30],
        [814, 36, 40, 44],
      ].forEach(([x, y, w, h], i) => {
        g.rect(x, y, w, h).fill(PAPER);
        g.rect(x + 6, y + 8, w - 12, 3).fill({ color: INK, alpha: 0.25 });
        g.rect(x + 6, y + 15, w - 20, 3).fill({ color: INK, alpha: 0.15 });
        g.circle(x + w / 2, y + 3, 2.5).fill(i === 1 ? TEAL : 0x9a6262);
      });

      // meeting table with chairs
      const tx = W / 2;
      const ty = height - 58;
      for (const [cx, cy] of [
        [tx - 70, ty - 26],
        [tx, ty - 34],
        [tx + 70, ty - 26],
        [tx - 70, ty + 26],
        [tx + 70, ty + 26],
      ])
        g.roundRect(cx - 12, cy - 9, 24, 18, 6).fill(0xbdb7ab);
      g.ellipse(tx, ty + 3, 110, 30).fill(WOOD_EDGE);
      g.ellipse(tx, ty, 110, 30).fill(WOOD);

      // plants
      for (const [px, py, s] of [
        [36, WALL_H + 34, 1],
        [W - 36, WALL_H + 34, 1],
        [44, height - 34, 1.2],
        [W - 44, height - 34, 1.2],
      ])
        drawPlant(g, px, py, s);
    },
    [height],
  );
  return <pixiGraphics draw={draw} zIndex={0} />;
}

function drawPlant(g: Graphics, x: number, y: number, s: number) {
  g.ellipse(x, y + 12 * s, 14 * s, 4 * s).fill({ color: INK, alpha: 0.1 });
  for (const [dx, dy, r, c] of [
    [-8, -16, 9, 0x7c8a5b],
    [7, -18, 10, 0x6b8f78],
    [0, -28, 10, 0x7c8a5b],
    [-2, -12, 8, 0x6b8f78],
  ])
    g.circle(x + dx * s, y + dy * s, r * s).fill(c);
  g.roundRect(x - 11 * s, y - 6 * s, 22 * s, 18 * s, 4 * s).fill(0xb98a62);
}

function Desk({ index }: { index: number }) {
  const { x, y } = deskAt(index);
  const draw = useCallback((g: Graphics) => {
    g.clear();
    g.roundRect(-62, -12, 124, 40, 6).fill(WOOD_EDGE);
    g.roundRect(-62, -14, 124, 34, 6).fill(WOOD);
    // laptop seen from the front (its lid faces us)
    g.roundRect(-20, -26, 40, 22, 3).fill(0x8f8b82);
    g.roundRect(-24, -6, 48, 5, 2).fill(0x6f6b63);
    g.circle(0, -15, 2).fill({ color: PAPER, alpha: 0.7 });
    // mug and papers
    g.roundRect(34, -10, 10, 11, 3).fill(PAPER).stroke({ width: 1, color: MIST });
    g.rect(-50, -8, 18, 12).fill(PAPER);
  }, []);
  const chair = useCallback((g: Graphics) => {
    g.clear();
    g.roundRect(-16, -44, 32, 34, 9).fill(0x8d8a80);
  }, []);
  return (
    <>
      <pixiGraphics x={x} y={y} draw={chair} zIndex={y - 40} />
      <pixiGraphics x={x} y={y} draw={draw} zIndex={y + 5} />
    </>
  );
}

function Character({
  agent,
  activity,
  deskIndex,
  scale,
  onHover,
  onSelect,
}: {
  agent: Agent;
  activity: Activity;
  deskIndex: number;
  scale: number;
  onHover: (p: Pointer | null) => void;
  onSelect: (p: Pointer) => void;
}) {
  const desk = deskAt(deskIndex);
  const [brain] = useState(() => new Brain(desk.seat, desk.gapX, deskIndex));
  const { seat, gapX } = desk;
  useEffect(() => brain.setDesk(seat, gapX), [brain, seat.x, seat.y, gapX]); // eslint-disable-line react-hooks/exhaustive-deps

  const root = useRef<Container>(null);
  const body = useRef<Container>(null);
  const legs = useRef<Graphics>(null);
  const eyes = useRef<Graphics>(null);
  const hands = useRef<Graphics>(null);
  const clock = useRef(pickBy(agent.id + "t", [0, 1300, 2600, 3900, 5200]));
  const steps = useMemo(() => stepsFor(agent.role, agent.name), [agent.role, agent.name]);
  const working = activity === "working";

  const color = agentColor(agent.id);
  const skin = pickBy(agent.id + "s", SKIN);
  const hair = pickBy(agent.id + "h", HAIR);

  const tick = useCallback(
    (ticker: Ticker) => {
      const b = brain;
      const dt = Math.min(ticker.deltaMS, 100);
      clock.current += dt;
      const t = clock.current / 1000;
      b.update(dt, working, steps);
      const r = root.current;
      if (!r) return;
      r.x = b.pos.x;
      r.y = b.pos.y;
      r.zIndex = b.pos.y;

      const walking = b.mode === "walk";
      const bob = walking ? Math.abs(Math.sin(t * 7)) * 2.5 : 0;
      if (body.current) {
        body.current.y = -bob;
        body.current.scale.y = walking ? 1 : 1 + Math.sin(t * 1.7) * 0.015; // breathing
      }
      if (legs.current) {
        legs.current.visible = !b.seated;
        legs.current.scale.y = walking ? 0.85 + Math.abs(Math.cos(t * 7)) * 0.15 : 1;
      }
      if (eyes.current) eyes.current.scale.y = t % 4.2 < 0.12 ? 0.15 : 1; // blink
      const h = hands.current;
      if (h) {
        h.clear();
        const busy = b.mode === "work";
        if (busy && b.action === "type") {
          const a = Math.sin(t * 9) * 1.5;
          h.circle(-7, -12 + a, 3).fill(skin);
          h.circle(7, -12 - a, 3).fill(skin);
        } else if (busy && (b.action === "write" || b.action === "pin")) {
          h.circle(-12, -14, 3).fill(skin);
          h.circle(10 + Math.sin(t * 2.2) * 6, -40 + Math.cos(t * 2.2) * 3, 3).fill(skin);
        } else if (busy && b.action === "study") {
          h.circle(-12, -14, 3).fill(skin);
          h.circle(8, -26 + Math.sin(t * 1.2) * 1, 3).fill(skin); // hand on chin
        } else {
          const swing = walking ? Math.sin(t * 7) * 3 : 0;
          h.circle(-12, -14 + swing, 3).fill(skin);
          h.circle(12, -14 - swing, 3).fill(skin);
        }
      }
    },
    [brain, working, steps, skin],
  );
  useTick(tick);

  const drawShadow = useCallback((g: Graphics) => {
    g.clear();
    g.ellipse(0, 0, 13, 4).fill({ color: INK, alpha: 0.12 });
  }, []);
  const drawLegs = useCallback((g: Graphics) => {
    g.clear();
    g.roundRect(-8, -10, 6, 10, 2).fill(0x4a463d);
    g.roundRect(2, -10, 6, 10, 2).fill(0x4a463d);
  }, []);
  const drawBody = useCallback(
    (g: Graphics) => {
      g.clear();
      g.roundRect(-12, -32, 24, 24, 9).fill(color);
      g.roundRect(-4, -32, 8, 5, 2).fill({ color: PAPER, alpha: 0.5 }); // collar
      // head
      g.ellipse(0, -46, 11.5, 9).fill(hair);
      g.circle(0, -42, 10).fill(skin);
      g.ellipse(0, -49, 9.5, 4.5).fill(hair);
    },
    [color, hair, skin],
  );
  const drawEyes = useCallback((g: Graphics) => {
    g.clear();
    g.circle(-3.6, 0, 1.5).fill(INK);
    g.circle(3.6, 0, 1.5).fill(INK);
  }, []);
  const drawBadge = useCallback(
    (g: Graphics) => {
      g.clear();
      g.circle(0, 0, 4.5).fill(0xfaf8f5);
      g.circle(0, 0, 3.2).fill(ACTIVITY_HEX[activity]);
    },
    [activity],
  );

  const pointer = (): Pointer => {
    const r = root.current;
    const p = r ? r.getGlobalPosition() : { x: 0, y: 0 };
    return { agentId: agent.id, x: p.x, y: p.y - 62 * scale };
  };

  return (
    <pixiContainer
      ref={root}
      x={desk.seat.x}
      y={desk.seat.y}
      eventMode="static"
      cursor="pointer"
      hitArea={new Rectangle(-18, -66, 36, 70)}
      onPointerOver={() => onHover(pointer())}
      onPointerOut={() => onHover(null)}
      onPointerTap={() => onSelect(pointer())}
    >
      <pixiGraphics draw={drawShadow} />
      <pixiGraphics ref={legs} draw={drawLegs} visible={false} />
      <pixiContainer ref={body}>
        <pixiGraphics draw={drawBody} />
        <pixiGraphics ref={eyes} draw={drawEyes} y={-41} />
        <pixiGraphics ref={hands} draw={() => {}} />
        <pixiGraphics draw={drawBadge} x={10} y={-52} />
        <Bubble activity={activity} />
        <pixiText
          text={agent.name}
          anchor={{ x: 0.5, y: 1 }}
          y={-58}
          resolution={2}
          style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 11, fill: INK, fontWeight: "500" }}
        />
      </pixiContainer>
    </pixiContainer>
  );
}

/** "II" when paused, "?" when waiting for approval, red "!" on error. */
function Bubble({ activity }: { activity: Activity }) {
  const kind = activity === "paused" ? "II" : activity === "pending" ? "?" : activity === "error" ? "!" : null;
  const draw = useCallback(
    (g: Graphics) => {
      g.clear();
      if (!kind) return;
      const fill = kind === "!" ? 0xb4483c : PAPER;
      g.roundRect(-11, -11, 22, 20, 8).fill(fill).stroke({ width: 1, color: kind === "!" ? 0xb4483c : MIST });
      g.poly([-3, 8, 3, 8, -5, 14]).fill(fill);
    },
    [kind],
  );
  if (!kind) return null;
  return (
    <pixiContainer x={22} y={-74}>
      <pixiGraphics draw={draw} />
      <pixiText
        text={kind}
        anchor={0.5}
        y={-1}
        resolution={2}
        style={{ fontFamily: "Inter, system-ui, sans-serif", fontSize: 12, fill: kind === "!" ? 0xffffff : INK, fontWeight: "500" }}
      />
    </pixiContainer>
  );
}

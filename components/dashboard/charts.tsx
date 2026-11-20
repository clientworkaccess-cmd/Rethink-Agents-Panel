"use client";
// Plain-SVG charts (no chart library): animated on load, calm tooltips, colours from theme variables.
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "@/lib/theme";
import { flyoutClass } from "../ui";
import type { DayPoint } from "@/lib/types";

/** Matches --motion-counter (JS needs the number for its rAF loop; reduced motion skips it). */
const COUNTER_MS = 700;

/** Counts up to `value` when it first appears or changes. */
export function Counter({ value, format = (n) => Math.round(n).toLocaleString() }: { value: number; format?: (n: number) => string }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced) {
      from.current = value;
      // eslint-disable-next-line react-hooks/set-state-in-effect -- no animation under reduced motion
      setShown(value);
      return;
    }
    const start = performance.now();
    const a = from.current;
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - start) / COUNTER_MS);
      const e = 1 - (1 - k) ** 3;
      setShown(a + (value - a) * e);
      if (k < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return <>{format(shown)}</>;
}

const dayLabel = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric" });

/** Runs per day (bars) with tasks completed per day (line), last 14 days. Either series may be missing. */
export function ActivityChart({ runs, done }: { runs: DayPoint[] | null; done: DayPoint[] | null }) {
  const reduced = useReducedMotion();
  const [hover, setHover] = useState<number | null>(null);
  const [grown, setGrown] = useState(reduced);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const days = runs ?? done ?? [];
  const n = days.length;
  const W = 640;
  const H = 180;
  const pad = { l: 28, r: 8, t: 12, b: 24 };
  const max = Math.max(1, ...(runs ?? []).map((p) => p.value), ...(done ?? []).map((p) => p.value));
  const step = (W - pad.l - pad.r) / Math.max(1, n);
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, Math.round(max / 2), max];
  const line = done?.map((p, i) => `${i ? "L" : "M"}${pad.l + step * i + step / 2},${y(p.value)}`).join(" ");

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Runs per day and tasks completed per day, last 14 days" onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} stroke="var(--chart-grid)" strokeWidth="1" />
            <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" fontSize="9" fill="var(--muted-foreground)" fontFamily="var(--font-mono)">
              {t}
            </text>
          </g>
        ))}
        {runs?.map((p, i) => {
          const h = H - pad.b - y(p.value);
          return (
            <rect
              key={p.day}
              x={pad.l + step * i + step * 0.2}
              width={step * 0.6}
              y={grown ? y(p.value) : H - pad.b}
              height={grown ? h : 0}
              rx="2"
              fill={hover === i ? "var(--chart-1)" : "color-mix(in oklab, var(--chart-1) 60%, transparent)"}
              style={{
                transition: reduced
                  ? undefined
                  : `y var(--motion-chart-grow) var(--motion-ease-standard) calc(var(--motion-stagger) * ${i}), height var(--motion-chart-grow) var(--motion-ease-standard) calc(var(--motion-stagger) * ${i}), fill var(--motion-duration-fast)`,
              }}
            />
          );
        })}
        {line && (
          <path
            d={line}
            fill="none"
            stroke="var(--chart-2)"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray="1"
            strokeDashoffset={grown ? 0 : 1}
            style={{ transition: reduced ? undefined : "stroke-dashoffset var(--motion-chart-grow) var(--motion-ease-standard) var(--motion-duration-base)" }}
          />
        )}
        {done?.map((p, i) => (
          <circle key={p.day} cx={pad.l + step * i + step / 2} cy={y(p.value)} r={hover === i ? 3.5 : 2.2} fill="var(--chart-2)" />
        ))}
        {days.map((p, i) =>
          i % 2 === 0 || i === n - 1 ? (
            <text key={p.day} x={pad.l + step * i + step / 2} y={H - 8} textAnchor="middle" fontSize="9" fill="var(--muted-foreground)" fontFamily="var(--font-mono)">
              {dayLabel(p.day)}
            </text>
          ) : null,
        )}
        {days.map((p, i) => (
          <rect key={`hit-${p.day}`} x={pad.l + step * i} y={pad.t} width={step} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} />
        ))}
      </svg>
      {hover !== null && days[hover] && (
        <div
          className={`pointer-events-none absolute top-0 z-10 -translate-x-1/2 px-3 py-2 text-xs ${flyoutClass}`}
          style={{ left: `${((pad.l + step * hover + step / 2) / W) * 100}%` }}
        >
          <p className="font-mono text-xs">{dayLabel(days[hover].day)}</p>
          {runs && <p className="text-foreground">{runs[hover].value} runs</p>}
          {done && <p className="text-foreground">{done[hover].value} tasks done</p>}
        </div>
      )}
      <div className="mt-2 flex gap-4 text-xs">
        {runs && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block size-2.5 rounded-sm bg-chart-1" /> Runs per day
          </span>
        )}
        {done && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block h-0.5 w-3 bg-chart-2" /> Tasks completed per day
          </span>
        )}
      </div>
    </div>
  );
}

export function Sparkline({ values, color = "var(--chart-1)" }: { values: number[]; color?: string }) {
  const W = 96;
  const H = 26;
  const max = Math.max(1, ...values);
  const step = W / Math.max(1, values.length - 1);
  const pts = values.map((v, i) => `${i * step},${H - 2 - (v / max) * (H - 4)}`);
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <polyline points={`0,${H} ${pts.join(" ")} ${W},${H}`} fill="color-mix(in oklab, var(--chart-1) 14%, transparent)" stroke="none" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

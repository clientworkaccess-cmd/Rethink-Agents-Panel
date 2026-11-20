"use client";
// Reads design tokens from app/globals.css at runtime, for code that cannot use CSS (the Pixi scenes).
// app/globals.css stays the single source: nothing here hardcodes a colour. Any CSS colour syntax works
// (oklch, color-mix, var chains): the browser resolves it on a 1x1 canvas.
import type { Activity } from "./types";

let ctx: CanvasRenderingContext2D | null = null;

function resolve(css: string): number | null {
  if (typeof document === "undefined") return null;
  ctx ??= document.createElement("canvas").getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.clearRect(0, 0, 1, 1);
  ctx.fillStyle = css;
  ctx.fillRect(0, 0, 1, 1);
  const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
  return (r << 16) | (g << 8) | b;
}

/** A colour token (name without `--`) as a Pixi number, resolved against the current theme. */
export function tokenColor(name: string, fallback = 0x808080): number {
  if (typeof document === "undefined") return fallback;
  // set it on a probe so var() chains resolve to a concrete colour
  const probe = document.createElement("span");
  probe.style.color = `var(--${name})`;
  probe.style.display = "none";
  document.body.appendChild(probe);
  const css = getComputedStyle(probe).color;
  probe.remove();
  return resolve(css) ?? fallback;
}

/** A non-colour token's raw value (fonts, sizes). */
export function tokenValue(name: string, fallback = ""): string {
  if (typeof document === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim() || fallback;
}

const STATUS_TOKEN: Record<Activity, string> = {
  working: "status-working",
  idle: "status-idle",
  paused: "status-paused",
  pending: "status-waiting",
  error: "status-error",
  hidden: "status-idle",
};

/** Status colour for Pixi rings, from the same tokens the DOM status dots use. */
export const activityHex = (a: Activity) => tokenColor(STATUS_TOKEN[a]);

let cached: { theme: string; chrome: SceneChrome } | null = null;

/** Everything the character rig draws around the art (bubbles, labels). Cached per theme. */
export function sceneChrome(): SceneChrome {
  const theme = typeof document === "undefined" ? "ssr" : (document.documentElement.dataset.theme ?? "light");
  if (cached?.theme === theme) return cached.chrome;
  const chrome = readChrome();
  cached = { theme, chrome };
  return chrome;
}

function readChrome() {
  return {
    bubbleBg: tokenColor("scene-bubble-bg", 0xffffff),
    bubbleBorder: tokenColor("scene-bubble-border", 0xe0e0e0),
    bubbleFg: tokenColor("scene-bubble-fg", 0x222222),
    label: tokenColor("scene-label", 0x666666),
    code: tokenColor("scene-code", 0x22aa66),
    waiting: tokenColor("status-waiting", 0xdd9900),
    error: tokenColor("status-error", 0xcc3322),
    onStatus: tokenColor("primary-foreground", 0xffffff),
    paused: tokenColor("status-paused", 0x888888),
    fontSans: tokenValue("font-sans", "system-ui, sans-serif"),
    fontMono: tokenValue("font-mono", "ui-monospace, monospace"),
  };
}
export type SceneChrome = ReturnType<typeof readChrome>;

"use client";
// Browser helpers: calls the panel's own /api routes only (never Paperclip).
import { useEffect, useRef } from "react";

export class ApiFailure extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...init?.headers } });
  } catch {
    throw new ApiFailure("network", "The panel server is not reachable.", 0);
  }
  if (res.status === 401) {
    // full reload on purpose: drop all client state when the session ends
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.search)}`;
    throw new ApiFailure("unauthorized", "Please log in.", 401);
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string; message?: string }) | null;
  if (!res.ok || !data) throw new ApiFailure(data?.error ?? "error", data?.message ?? "Something went wrong.", res.status);
  return data;
}

/** True when the failure means Paperclip (or the panel server) cannot be reached. */
export const isUnreachable = (e: unknown) =>
  e instanceof ApiFailure && (e.code === "paperclip_unreachable" || e.code === "network");

/**
 * Calls `fn` now and then every `interval` ms (a number or a getter, so it can adapt).
 * Pauses while the browser tab is hidden and refreshes as soon as it is visible again.
 */
export function usePoll(fn: () => Promise<unknown> | void, interval: number | (() => number), deps: unknown[] = []) {
  const fnRef = useRef(fn);
  const intRef = useRef(interval);
  useEffect(() => {
    fnRef.current = fn;
    intRef.current = interval;
  });
  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const ms = () => (typeof intRef.current === "function" ? intRef.current() : intRef.current);
    const run = async () => {
      clearTimeout(timer);
      if (stopped) return;
      if (!document.hidden) {
        try {
          await fnRef.current();
        } catch {
          // callers keep their own error state
        }
      }
      if (!stopped) timer = setTimeout(run, ms());
    };
    const onVisible = () => {
      if (!document.hidden) run();
    };
    run();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export function newRequestId(): string {
  const c: Partial<Crypto> | undefined = typeof crypto === "undefined" ? undefined : crypto;
  if (typeof c?.randomUUID === "function") return c.randomUUID();
  // randomUUID is missing on plain-http origins (not a secure context): build an RFC 4122 v4 UUID by hand,
  // because Paperclip rejects any other clientRequestId format
  const b = new Uint8Array(16);
  if (typeof c?.getRandomValues === "function") c.getRandomValues(b);
  else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d < 14 ? `${d} d ago` : new Date(t).toLocaleDateString();
}

export function formatBytes(n: number | null): string {
  if (n === null) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

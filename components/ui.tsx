"use client";
// Small shared pieces: status dot, Markdown, friendly notices and loading states with a character.
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ACTIVITY_COLOR, ACTIVITY_LABEL } from "@/lib/agents";
import type { Activity } from "@/lib/types";
import Critter, { type CritterMood } from "./character/Critter";

/** A stand-in character for loading, empty and error states (not tied to an agent). */
const HELPER = { id: "panel-helper-3", role: "general", name: "helper" };

export function StatusDot({ activity, size = 8 }: { activity: Activity; size?: number }) {
  return (
    <span
      aria-label={ACTIVITY_LABEL[activity]}
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: ACTIVITY_COLOR[activity] }}
    />
  );
}

/** Agent Markdown. Raw HTML is not rendered (react-markdown escapes it by default). */
export function Markdown({ children }: { children: string }) {
  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export function Notice({
  title,
  text,
  onRetry,
  mood = "idle",
}: {
  title: string;
  text?: string;
  onRetry?: () => void;
  mood?: CritterMood;
}) {
  return (
    <div className="fade-in flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <Critter agent={HELPER} size={48} mood={mood} />
      <p className="display mt-2 text-[20px]">{title}</p>
      {text && <p className="max-w-sm text-caption text-body">{text}</p>}
      {onRetry && (
        <button onClick={onRetry} className="btn btn-outline mt-2">
          Try again
        </button>
      )}
    </div>
  );
}

export function Unreachable({ onRetry }: { onRetry?: () => void }) {
  return (
    <Notice
      mood="error"
      title="Paperclip is not reachable"
      text="The agents are still there. We will keep trying in the background."
      onRetry={onRetry}
    />
  );
}

/** Loading state: a small busy character, not a grey spinner. */
export function Loading({ label = "Fetching…", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className={`fade-in flex items-center justify-center gap-3 ${compact ? "py-3" : "py-16"}`} role="status">
      <Critter agent={HELPER} size={compact ? 24 : 36} mood="busy" />
      <span className="eyebrow">{label}</span>
    </div>
  );
}

export function Dots() {
  return (
    <span className="dots inline-flex gap-0.5" aria-hidden>
      <span className="h-1 w-1 rounded-full bg-muted" />
      <span className="h-1 w-1 rounded-full bg-muted" />
      <span className="h-1 w-1 rounded-full bg-muted" />
    </span>
  );
}

export function statusText(s: string) {
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function StatusPill({ status }: { status: string }) {
  const done = status === "done" || status === "completed" || status === "cancelled";
  const active = status === "in_progress";
  return (
    <span
      className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.22px] ${
        active ? "border-accent bg-accent-soft text-accent-ink" : done ? "border-line text-muted" : "border-line text-body"
      }`}
    >
      {statusText(status)}
    </span>
  );
}

export function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <p className={`eyebrow ${className}`}>{children}</p>;
}

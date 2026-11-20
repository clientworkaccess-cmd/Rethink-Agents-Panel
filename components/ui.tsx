"use client";
// Small shared pieces: status dot, Markdown, calm notices.
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ACTIVITY_COLOR, ACTIVITY_LABEL } from "@/lib/agents";
import type { Activity } from "@/lib/types";

export function StatusDot({ activity, size = 8 }: { activity: Activity; size?: number }) {
  return (
    <span
      aria-label={ACTIVITY_LABEL[activity]}
      className="inline-block shrink-0 rounded-full"
      style={{ width: size, height: size, background: ACTIVITY_COLOR[activity] }}
    />
  );
}

export function Avatar({ name, color, size = 28 }: { name: string; color: string; size?: number }) {
  return (
    <span
      className="inline-flex shrink-0 items-center justify-center rounded-full text-caption font-medium text-white"
      style={{ width: size, height: size, background: color }}
      aria-hidden
    >
      {name.slice(0, 1).toUpperCase()}
    </span>
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

export function Notice({ title, text, onRetry }: { title: string; text?: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-12 text-center">
      <p className="text-body-lg text-ink">{title}</p>
      {text && <p className="max-w-sm text-body text-graphite">{text}</p>}
      {onRetry && (
        <button onClick={onRetry} className="mt-2 rounded-md border border-warm-mist px-3 py-1.5 text-body text-graphite hover:text-ink">
          Try again
        </button>
      )}
    </div>
  );
}

export function Unreachable({ onRetry }: { onRetry?: () => void }) {
  return <Notice title="Paperclip is not reachable" text="The agents are still there. We will keep trying in the background." onRetry={onRetry} />;
}

export function Dots() {
  return (
    <span className="dots inline-flex gap-0.5" aria-hidden>
      <span className="h-1 w-1 rounded-full bg-graphite" />
      <span className="h-1 w-1 rounded-full bg-graphite" />
      <span className="h-1 w-1 rounded-full bg-graphite" />
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
      className={`shrink-0 rounded-full px-2 py-0.5 text-caption ${
        active ? "bg-deep-teal text-white" : done ? "text-ash" : "border border-warm-mist text-graphite"
      }`}
    >
      {statusText(status)}
    </span>
  );
}

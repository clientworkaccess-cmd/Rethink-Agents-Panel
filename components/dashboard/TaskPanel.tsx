"use client";
// Read-only side panel for one task: description and comments.
import { useEffect, useState } from "react";
import { agentColor, hexCss } from "@/lib/agents";
import { api, isUnreachable, timeAgo } from "@/lib/client";
import type { Comment, Issue } from "@/lib/types";
import { Avatar, Markdown, Notice, StatusPill, Unreachable } from "../ui";

export default function TaskPanel({
  issueId,
  agentName,
  onClose,
}: {
  issueId: string;
  agentName: (id: string | null) => string;
  onClose: () => void;
}) {
  const [data, setData] = useState<{ issue: Issue; comments: Comment[] } | null>(null);
  const [error, setError] = useState<"unreachable" | "other" | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api<{ issue: Issue; comments: Comment[] }>(`/api/issues/${encodeURIComponent(issueId)}`)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(isUnreachable(e) ? "unreachable" : "other"));
    return () => {
      cancelled = true;
    };
  }, [issueId, attempt]);

  const retry = () => {
    setError(null);
    setAttempt((n) => n + 1);
  };

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  return (
    <aside className="fixed bottom-0 right-0 top-14 z-20 flex w-full max-w-[480px] flex-col border-l border-warm-mist bg-parchment shadow-subtle" aria-label="Task">
      <div className="flex items-start gap-3 border-b border-warm-mist/70 px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="text-body-sm text-graphite">{data?.issue.identifier ?? "Task"}</p>
          <p className="text-body-lg text-ink">{data?.issue.title ?? "Loading…"}</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-md p-1.5 text-graphite hover:bg-warm-mist/40 hover:text-ink">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {error === "unreachable" && <Unreachable onRetry={retry} />}
        {error === "other" && <Notice title="Could not load this task" onRetry={retry} />}
        {data && (
          <>
            <div className="mb-4 flex items-center gap-2 text-body-sm text-graphite">
              <StatusPill status={data.issue.status} />
              <span>{agentName(data.issue.assigneeAgentId)}</span>
              <span className="text-ash">· updated {timeAgo(data.issue.updatedAt)}</span>
            </div>
            {data.issue.description ? <Markdown>{data.issue.description}</Markdown> : <p className="text-body text-graphite">No description.</p>}
            <h3 className="mb-3 mt-8 text-body-sm uppercase tracking-wide text-graphite">Comments</h3>
            {data.comments.length === 0 && <p className="text-body text-graphite">No comments yet.</p>}
            <ul className="flex flex-col gap-4">
              {data.comments.map((c) => {
                const name = c.authorAgentId ? agentName(c.authorAgentId) : "You";
                return (
                  <li key={c.id} className="flex gap-3">
                    <Avatar name={name} color={c.authorAgentId ? hexCss(agentColor(c.authorAgentId)) : "#27251e"} size={24} />
                    <div className="min-w-0 flex-1">
                      <p className="mb-0.5 text-body-sm text-graphite">
                        {name} <span className="text-ash">· {timeAgo(c.createdAt)}</span>
                      </p>
                      <Markdown>{c.body}</Markdown>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>
    </aside>
  );
}

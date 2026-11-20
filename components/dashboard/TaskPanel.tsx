"use client";
// Read-only side panel for one task: description and comments.
import { useEffect, useState } from "react";
import { api, isUnreachable, timeAgo } from "@/lib/client";
import type { Agent, Comment, Issue } from "@/lib/types";
import Critter from "../character/Critter";
import { Loading, Markdown, Notice, StatusPill, Unreachable } from "../ui";

export default function TaskPanel({ issueId, agents, onClose }: { issueId: string; agents: Agent[]; onClose: () => void }) {
  const [data, setData] = useState<{ issue: Issue; comments: Comment[] } | null>(null);
  const [error, setError] = useState<"unreachable" | "other" | null>(null);
  const [attempt, setAttempt] = useState(0);
  const agentOf = (id: string | null) => agents.find((a) => a.id === id) ?? null;

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

  const owner = data ? agentOf(data.issue.assigneeAgentId) : null;

  return (
    <aside className="slide-in-right fixed bottom-0 right-0 top-14 z-20 flex w-full max-w-[500px] flex-col border-l border-line bg-canvas" aria-label="Task">
      <div className="flex items-start gap-3 border-b border-line px-5 py-4">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{data?.issue.identifier ?? "Task"}</p>
          <p className="display text-[22px]">{data?.issue.title ?? "Loading…"}</p>
        </div>
        <button onClick={onClose} aria-label="Close" className="rounded-sm p-1.5 text-body transition-colors hover:bg-surface hover:text-accent">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round">
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
        {error === "unreachable" && <Unreachable onRetry={retry} />}
        {error === "other" && <Notice title="Could not load this task" onRetry={retry} mood="error" />}
        {!data && !error && <Loading />}
        {data && (
          <>
            <div className="mb-4 flex items-center gap-2 text-[13px] text-body">
              <StatusPill status={data.issue.status} />
              {owner && <Critter agent={owner} size={20} head />}
              <span>{owner?.name ?? "Unassigned"}</span>
              <span className="text-muted">· updated {timeAgo(data.issue.updatedAt)}</span>
            </div>
            {data.issue.description ? <Markdown>{data.issue.description}</Markdown> : <p className="text-caption text-body">No description.</p>}
            <p className="eyebrow mb-3 mt-8">Comments</p>
            {data.comments.length === 0 && <p className="text-caption text-body">No comments yet.</p>}
            <ul className="flex flex-col gap-4">
              {data.comments.map((c) => {
                const a = agentOf(c.authorAgentId);
                return (
                  <li key={c.id} className="flex gap-3">
                    {a ? (
                      <Critter agent={a} size={24} head />
                    ) : (
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ink font-mono text-[10px] text-canvas">You</span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="mb-0.5 font-mono text-[10px] uppercase tracking-[0.22px] text-muted">
                        {a?.name ?? (c.authorAgentId ? "Agent" : "You")} · {timeAgo(c.createdAt)}
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

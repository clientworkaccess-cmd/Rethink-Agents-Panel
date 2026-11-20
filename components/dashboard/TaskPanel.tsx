"use client";
// Read-only side panel for one task: description and comments.
import { useEffect, useState } from "react";
import { api, isUnreachable, timeAgo } from "@/lib/client";
import type { Agent, Comment, Issue } from "@/lib/types";
import Critter from "../character/Critter";
import { EmptyState, Icon, IconButton, Loading, Markdown, Mono, SectionLabel, StatusBadge, Unreachable } from "../ui";

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
    <aside
      className="slide-in-right absolute inset-y-0 right-0 z-20 flex w-full max-w-chat flex-col border-l border-border bg-background shadow-flyout sm:w-aside-wide"
      aria-label="Task"
    >
      <div className="flex shrink-0 items-start gap-3 border-b border-border px-6 py-4">
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <h2 className="text-2xl font-normal text-foreground">{data?.issue.title ?? "Loading…"}</h2>
          {data && (
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <StatusBadge status={data.issue.status} />
              {data.issue.identifier && <Mono>{data.issue.identifier}</Mono>}
              <span className="inline-flex items-center gap-1.5">
                {owner && <Critter agent={owner} size={20} head />}
                {owner?.name ?? "Unassigned"}
              </span>
              <span>
                · updated <Mono>{timeAgo(data.issue.updatedAt)}</Mono>
              </span>
            </div>
          )}
        </div>
        <IconButton label="Close" onClick={onClose}>
          <Icon name="close" />
        </IconButton>
      </div>
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-6 py-4">
        {error === "unreachable" && <Unreachable onRetry={retry} />}
        {error === "other" && <EmptyState title="Could not load this task" text="Please try again in a moment." onRetry={retry} mood="error" />}
        {!data && !error && <Loading />}
        {data && (
          <div className="flex flex-col gap-8">
            {data.issue.description ? <Markdown>{data.issue.description}</Markdown> : <p className="text-sm">No description.</p>}
            <section className="flex flex-col gap-4">
              <SectionLabel as="h3">Comments</SectionLabel>
              {data.comments.length === 0 && <p className="text-sm">No comments yet.</p>}
              <ul className="flex flex-col gap-5">
                {data.comments.map((c) => {
                  const a = agentOf(c.authorAgentId);
                  return (
                    <li key={c.id} className="flex flex-col gap-2">
                      <div className="flex items-center gap-2">
                        {a ? (
                          <Critter agent={a} size={24} head />
                        ) : (
                          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted-highlight text-xs text-foreground" aria-hidden>
                            Y
                          </span>
                        )}
                        <span className="text-sm font-semibold text-foreground">{a?.name ?? (c.authorAgentId ? "Agent" : "You")}</span>
                        <Mono>{timeAgo(c.createdAt)}</Mono>
                      </div>
                      <div className="pl-8">
                        <Markdown>{c.body}</Markdown>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          </div>
        )}
      </div>
    </aside>
  );
}

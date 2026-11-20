"use client";
// One chat. Paperclip models it as an issue: messages are comments, a reply is a comment with authorAgentId.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { agentColor, hexCss } from "@/lib/agents";
import { api, isUnreachable, newRequestId, timeAgo, usePoll } from "@/lib/client";
import type { Agent, Artifact, Comment, Issue, RunProgress } from "@/lib/types";
import { ArtifactChip } from "../artifacts";
import { Avatar, Dots, Markdown, Notice, Unreachable } from "../ui";

const FAST_MS = 2500;
const SLOW_MS = 15_000;

type Local = { localId: string; body: string; clientRequestId: string; status: "sending" | "failed"; createdAt: string };

const EXAMPLES: Record<string, string[]> = {
  cro: [
    "How is occupancy trending this month?",
    "Which unit sizes should we look at re-pricing?",
    "Write a short report on this week's move-ins and move-outs.",
  ],
  default: ["What are you working on right now?", "Summarise your last finished task.", "Is there anything you need from me?"],
};

export default function Conversation({
  agent,
  agentRunning,
  openArtifactId,
  onOpenArtifact,
}: {
  agent: Agent;
  agentRunning: boolean;
  openArtifactId: string | null;
  onOpenArtifact: (a: Artifact) => void;
}) {
  const [issue, setIssue] = useState<Issue | null>(null);
  const [openError, setOpenError] = useState<"unreachable" | "other" | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [local, setLocal] = useState<Local[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [waitingSince, setWaitingSince] = useState<string | null>(null); // id of my last sent comment
  const [progress, setProgress] = useState<RunProgress>({ running: false, runId: null, lastSeq: 0, lines: [] });
  const [lostConnection, setLostConnection] = useState(false);
  const [draft, setDraft] = useState("");
  const [attempt, setAttempt] = useState(0);
  const scroller = useRef<HTMLDivElement>(null);
  const lastId = useRef<string | null>(null);
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const color = hexCss(agentColor(agent.id));
  const waiting = waitingSince !== null || progress.running || local.some((l) => l.status === "sending");

  const loadArtifacts = useCallback(async (issueId: string) => {
    try {
      const r = await api<{ artifacts: Artifact[] }>(`/api/issues/${encodeURIComponent(issueId)}/artifacts`);
      setArtifacts(r.artifacts);
    } catch {
      // keep what we have
    }
  }, []);

  // 1. Open (or reuse) the chat issue, then load history and artifacts.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { issue } = await api<{ issue: Issue }>(`/api/chats/${encodeURIComponent(agent.id)}`, { method: "POST" });
        if (cancelled) return;
        setIssue(issue);
        const { comments } = await api<{ comments: Comment[] }>(`/api/issues/${encodeURIComponent(issue.id)}/comments`);
        if (cancelled) return;
        setComments(comments);
        lastId.current = comments.at(-1)?.id ?? null;
        setLoaded(true);
        loadArtifacts(issue.id);
      } catch (e) {
        if (!cancelled) setOpenError(isUnreachable(e) ? "unreachable" : "other");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agent.id, attempt, loadArtifacts]);

  // 2. Poll for new comments (fast while a reply is pending) and run progress.
  const poll = useCallback(async () => {
    if (!issue || !loaded) return;
    const id = encodeURIComponent(issue.id);
    try {
      const q = lastId.current ? `?after=${encodeURIComponent(lastId.current)}` : "";
      const { comments: fresh } = await api<{ comments: Comment[] }>(`/api/issues/${id}/comments${q}`);
      setLostConnection(false);
      if (fresh.length) {
        lastId.current = fresh.at(-1)!.id;
        setComments((prev) => {
          const seen = new Set(prev.map((c) => c.id));
          return [...prev, ...fresh.filter((c) => !seen.has(c.id))];
        });
        if (fresh.some((c) => c.authorAgentId)) {
          setWaitingSince(null);
          loadArtifacts(issue.id);
        }
      }
      const p = progressRef.current;
      if (waitingSince || agentRunning || p.running) {
        const next = await api<RunProgress>(
          `/api/issues/${id}/progress?afterSeq=${p.lastSeq}${p.runId ? `&runId=${encodeURIComponent(p.runId)}` : ""}`,
        );
        setProgress((cur) => ({
          ...next,
          lines: next.runId === cur.runId ? [...cur.lines, ...next.lines].slice(-3) : next.lines.slice(-3),
        }));
      }
    } catch (e) {
      if (isUnreachable(e)) setLostConnection(true);
    }
  }, [issue, loaded, waitingSince, agentRunning, loadArtifacts]);
  usePoll(poll, () => (waiting ? FAST_MS : SLOW_MS), [issue?.id, loaded, waiting, waitingSince]);

  // 3. Send (optimistic) and retry.
  const send = useCallback(
    async (body: string, existing?: Local) => {
      if (!issue || !body.trim()) return;
      const msg: Local = existing
        ? { ...existing, status: "sending" }
        : { localId: newRequestId(), body: body.trim(), clientRequestId: newRequestId(), status: "sending", createdAt: new Date().toISOString() };
      setLocal((prev) => (existing ? prev.map((l) => (l.localId === msg.localId ? msg : l)) : [...prev, msg]));
      try {
        const { comment } = await api<{ comment: Comment }>(`/api/issues/${encodeURIComponent(issue.id)}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: msg.body, clientRequestId: msg.clientRequestId }),
        });
        setLocal((prev) => prev.filter((l) => l.localId !== msg.localId));
        setComments((prev) => (prev.some((c) => c.id === comment.id) ? prev : [...prev, comment]));
        lastId.current = comment.id;
        setWaitingSince(comment.id);
      } catch {
        setLocal((prev) => prev.map((l) => (l.localId === msg.localId ? { ...l, status: "failed" } : l)));
      }
    },
    [issue],
  );

  function submit() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    send(text);
  }

  // Keep the newest message in view.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [comments.length, local.length, waiting, progress.lines.length]);

  // Place each artifact under the reply that created it (by comment id, else by time), or at the end.
  const { byComment, loose } = useMemo(() => placeArtifacts(artifacts, comments), [artifacts, comments]);

  const retryOpen = () => {
    setOpenError(null);
    setAttempt((n) => n + 1);
  };
  if (openError === "unreachable") return <Unreachable onRetry={retryOpen} />;
  if (openError) return <Notice title="Could not open this chat" text="Please try again in a moment." onRetry={retryOpen} />;

  const empty = loaded && comments.length === 0 && local.length === 0;
  const examples = EXAMPLES[agent.role.toLowerCase()] ?? EXAMPLES.default;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[760px] flex-col gap-6 px-4 py-6">
          {!loaded && <p className="text-body text-graphite">Opening chat…</p>}
          {empty && (
            <div className="flex flex-col items-center gap-4 py-16 text-center">
              <Avatar name={agent.name} color={color} size={40} />
              <p className="text-body-lg">Ask {agent.name} anything</p>
              <p className="max-w-sm text-body text-graphite">Replies arrive as whole messages. Documents and files the agent creates open on the right.</p>
              <div className="mt-2 flex flex-col gap-2">
                {examples.map((q) => (
                  <button key={q} onClick={() => send(q)} className="rounded-full border border-warm-mist px-4 py-2 text-body text-ink hover:border-graphite/50">
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {comments.map((c) =>
            c.authorAgentId ? (
              <div key={c.id} className="flex gap-3">
                <Avatar name={agent.name} color={color} size={28} />
                <div className="min-w-0 flex-1">
                  <p className="mb-1 text-body-sm text-graphite">
                    {agent.name} <span className="text-ash">· {timeAgo(c.createdAt)}</span>
                  </p>
                  <Markdown>{c.body}</Markdown>
                  {byComment.get(c.id)?.length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {byComment.get(c.id)!.map((a) => (
                        <ArtifactChip key={a.id} artifact={a} active={a.id === openArtifactId} onOpen={onOpenArtifact} />
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <UserBubble key={c.id} body={c.body} meta={timeAgo(c.createdAt)} />
            ),
          )}

          {local.map((l) => (
            <UserBubble
              key={l.localId}
              body={l.body}
              meta={l.status === "sending" ? "Sending…" : undefined}
              failed={l.status === "failed" ? () => send(l.body, l) : undefined}
            />
          ))}

          {loose.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-10">
              {loose.map((a) => (
                <ArtifactChip key={a.id} artifact={a} active={a.id === openArtifactId} onOpen={onOpenArtifact} />
              ))}
            </div>
          )}

          {waiting && (
            <div className="flex gap-3" aria-live="polite">
              <Avatar name={agent.name} color={color} size={28} />
              <div className="pt-1">
                <p className="flex items-center gap-2 text-body text-graphite">
                  Working <Dots />
                </p>
                {progress.lines.map((line, i) => (
                  <p key={i} className="mt-1 text-body-sm text-ash">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[760px] px-4 pb-4">
        {lostConnection && <p className="mb-2 text-body-sm text-graphite">Paperclip is not reachable right now. Retrying…</p>}
        <div className="flex items-end gap-2 rounded-xl border border-warm-mist bg-parchment p-2 focus-within:border-deep-teal/50">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={Math.min(6, Math.max(1, draft.split("\n").length))}
            placeholder={`Message ${agent.name}`}
            disabled={!loaded}
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-body-lg text-ink outline-none placeholder:text-graphite"
          />
          <button
            onClick={submit}
            disabled={!draft.trim() || !loaded}
            className="rounded-xl bg-ink px-3 py-2 text-body text-parchment transition-opacity disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}

function UserBubble({ body, meta, failed }: { body: string; meta?: string; failed?: () => void }) {
  return (
    <div className="flex flex-col items-end">
      <div className={`max-w-[80%] whitespace-pre-wrap rounded-2xl bg-soft-paper px-4 py-2.5 text-body shadow-subtle ${failed ? "opacity-70" : ""}`}>{body}</div>
      {failed ? (
        <p className="mt-1 text-body-sm text-st-error">
          Not sent.{" "}
          <button onClick={failed} className="underline underline-offset-2">
            Retry
          </button>
        </p>
      ) : (
        meta && <p className="mt-1 text-body-sm text-ash">{meta}</p>
      )}
    </div>
  );
}

function placeArtifacts(artifacts: Artifact[], comments: Comment[]) {
  const byComment = new Map<string, Artifact[]>();
  const loose: Artifact[] = [];
  const replies = comments.filter((c) => c.authorAgentId);
  for (const a of artifacts) {
    let target = a.commentId && comments.some((c) => c.id === a.commentId) ? a.commentId : null;
    if (!target && a.createdAt) {
      const t = new Date(a.createdAt).getTime();
      // agents save files first and reply right after: first reply at or after the artifact
      target = replies.find((c) => c.createdAt && new Date(c.createdAt).getTime() >= t - 1000)?.id ?? null;
    }
    if (target) byComment.set(target, [...(byComment.get(target) ?? []), a]);
    else loose.push(a);
  }
  return { byComment, loose };
}

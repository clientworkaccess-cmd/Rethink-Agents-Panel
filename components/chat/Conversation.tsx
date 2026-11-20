"use client";
// One chat session. Paperclip models it as an issue: messages are comments, a reply is a comment with authorAgentId.
// `issueId === null` is a new, not yet created session: the first message creates it (POST .../sessions).
// If a new session gets no reply in time (and no run is going), the chat falls back to the agent's single /chats conversation.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { propFor } from "@/components/character/model";
import { api, isUnreachable, newRequestId, timeAgo, usePoll } from "@/lib/client";
import type { Agent, Artifact, ChatSession, Comment, CreateSessionResult, RunProgress } from "@/lib/types";
import { ArtifactChip } from "../artifacts";
import Critter from "../character/Critter";
import { Dots, Loading, Markdown, Notice, Unreachable } from "../ui";

const FAST_MS = 2500;
const SLOW_MS = 15_000;

type Local = { localId: string; body: string; clientRequestId: string; status: "sending" | "failed"; createdAt: string };

const EXAMPLES: Record<string, string[]> = {
  tablet: [
    "How is occupancy trending this month?",
    "Which unit sizes should we look at re-pricing?",
    "Write a short report on this week's move-ins and move-outs.",
  ],
  megaphone: [
    "Draft a friendly email about our spring move-in offer.",
    "What could we post this week to bring in new tenants?",
    "Write three short ad headlines for 10x10 units.",
  ],
  magnifier: [
    "How do our 5x5 rates compare with nearby facilities?",
    "Which unit size has the biggest gap to the area median?",
    "Summarise the latest competitor price changes.",
  ],
  laptop: ["What are you working on right now?", "Summarise your last finished task.", "Is there anything you need from me?"],
};

type Props = {
  agent: Agent;
  agents: Agent[];
  issueId: string | null;
  legacy: boolean;
  agentRunning: boolean;
  replyTimeoutMs: number;
  openArtifactId: string | null;
  onOpenArtifact: (a: Artifact) => void;
  onCreated: (session: ChatSession, fallback: boolean) => void;
  onFallback: (session: ChatSession) => void;
  onReplyingChange: (replying: boolean) => void;
};

export default function Conversation({
  agent,
  issueId,
  legacy,
  agentRunning,
  replyTimeoutMs,
  openArtifactId,
  onOpenArtifact,
  onCreated,
  onFallback,
  onReplyingChange,
}: Props) {
  const [openError, setOpenError] = useState<"unreachable" | "other" | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loaded, setLoaded] = useState(issueId === null);
  const [local, setLocal] = useState<Local[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  /** My last unanswered message: id and when it was sent. */
  const [waiting, setWaiting] = useState<{ id: string; body: string; since: number } | null>(null);
  const [progress, setProgress] = useState<RunProgress>({ running: false, runId: null, lastSeq: 0, lines: [] });
  const [lostConnection, setLostConnection] = useState(false);
  const [draft, setDraft] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [fallingBack, setFallingBack] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const box = useRef<HTMLTextAreaElement>(null);
  const lastId = useRef<string | null>(null);
  const progressRef = useRef(progress);
  useEffect(() => {
    progressRef.current = progress;
  }, [progress]);

  const sending = local.some((l) => l.status === "sending");
  const busy = waiting !== null || progress.running || sending;
  useEffect(() => onReplyingChange(busy), [busy, onReplyingChange]);

  const loadArtifacts = useCallback(async (id: string) => {
    try {
      const r = await api<{ artifacts: Artifact[] }>(`/api/issues/${encodeURIComponent(id)}/artifacts`);
      setArtifacts(r.artifacts);
    } catch {
      // keep what we have
    }
  }, []);

  // 1. Load history and artifacts. An unanswered last message of mine means a reply is still pending.
  useEffect(() => {
    if (!issueId) return;
    let cancelled = false;
    (async () => {
      try {
        const { comments } = await api<{ comments: Comment[] }>(`/api/issues/${encodeURIComponent(issueId)}/comments`);
        if (cancelled) return;
        setComments(comments);
        lastId.current = comments.at(-1)?.id ?? null;
        const last = comments.at(-1);
        if (last && !last.authorAgentId && last.createdAt) {
          const since = new Date(last.createdAt).getTime();
          if (Date.now() - since < Math.max(replyTimeoutMs, 10 * 60_000)) setWaiting({ id: last.id, body: last.body, since });
        }
        setLoaded(true);
        loadArtifacts(issueId);
      } catch (e) {
        if (!cancelled) setOpenError(isUnreachable(e) ? "unreachable" : "other");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [issueId, attempt, loadArtifacts, replyTimeoutMs]);

  const fallBack = useCallback(
    async (body: string | null) => {
      if (fallingBack) return;
      setFallingBack(true);
      try {
        const r = await api<CreateSessionResult>(`/api/agents/${encodeURIComponent(agent.id)}/sessions/fallback`, {
          method: "POST",
          body: JSON.stringify(body ? { body, clientRequestId: newRequestId() } : {}),
        });
        onFallback(r.session);
      } catch {
        setFallingBack(false);
      }
    },
    [agent.id, fallingBack, onFallback],
  );

  // 2. Poll for new comments (fast while a reply is pending) and run progress.
  const poll = useCallback(async () => {
    if (!issueId || !loaded) return;
    const id = encodeURIComponent(issueId);
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
          setWaiting(null);
          loadArtifacts(issueId);
        }
      }
      const p = progressRef.current;
      let running = p.running;
      if (waiting || agentRunning || p.running) {
        const next = await api<RunProgress>(
          `/api/issues/${id}/progress?afterSeq=${p.lastSeq}${p.runId ? `&runId=${encodeURIComponent(p.runId)}` : ""}`,
        );
        running = next.running;
        setProgress((cur) => ({
          ...next,
          lines: next.runId === cur.runId ? [...cur.lines, ...next.lines].slice(-3) : next.lines.slice(-3),
        }));
      }
      // a new session that got no reply in time, with no run going: use the single /chats conversation
      if (waiting && !legacy && !running && !fresh.some((c) => c.authorAgentId) && Date.now() - waiting.since > replyTimeoutMs)
        await fallBack(waiting.body);
    } catch (e) {
      if (isUnreachable(e)) setLostConnection(true);
    }
  }, [issueId, loaded, waiting, agentRunning, loadArtifacts, legacy, replyTimeoutMs, fallBack]);
  usePoll(poll, () => (busy ? FAST_MS : SLOW_MS), [issueId, loaded, busy, waiting?.id]);

  // 3. Send (optimistic) and retry. The first message of a new session creates it.
  const send = useCallback(
    async (body: string, existing?: Local) => {
      if (!body.trim()) return;
      const msg: Local = existing
        ? { ...existing, status: "sending" }
        : { localId: newRequestId(), body: body.trim(), clientRequestId: newRequestId(), status: "sending", createdAt: new Date().toISOString() };
      setLocal((prev) => (existing ? prev.map((l) => (l.localId === msg.localId ? msg : l)) : [...prev, msg]));
      try {
        if (!issueId) {
          const r = await api<CreateSessionResult>(`/api/agents/${encodeURIComponent(agent.id)}/sessions`, {
            method: "POST",
            body: JSON.stringify({ body: msg.body, clientRequestId: msg.clientRequestId }),
          });
          onCreated(r.session, r.fallback);
          return;
        }
        const { comment } = await api<{ comment: Comment }>(`/api/issues/${encodeURIComponent(issueId)}/comments`, {
          method: "POST",
          body: JSON.stringify({ body: msg.body, clientRequestId: msg.clientRequestId }),
        });
        setLocal((prev) => prev.filter((l) => l.localId !== msg.localId));
        setComments((prev) => (prev.some((c) => c.id === comment.id) ? prev : [...prev, comment]));
        lastId.current = comment.id;
        setWaiting({ id: comment.id, body: msg.body, since: Date.now() });
      } catch {
        setLocal((prev) => prev.map((l) => (l.localId === msg.localId ? { ...l, status: "failed" } : l)));
      }
    },
    [issueId, agent.id, onCreated],
  );

  function submit() {
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    send(text);
  }

  // auto-grow the composer
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(220, el.scrollHeight)}px`;
  }, [draft]);

  // Keep the newest message in view.
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [comments.length, local.length, busy, progress.lines.length]);

  const { byComment, loose } = useMemo(() => placeArtifacts(artifacts, comments), [artifacts, comments]);

  const retryOpen = () => {
    setOpenError(null);
    setAttempt((n) => n + 1);
  };
  if (openError === "unreachable") return <Unreachable onRetry={retryOpen} />;
  if (openError) return <Notice title="Could not open this chat" text="Please try again in a moment." onRetry={retryOpen} mood="error" />;
  if (fallingBack) return <Loading label="Switching to the main conversation…" />;

  const empty = loaded && comments.length === 0 && local.length === 0;
  const examples = EXAMPLES[propFor(agent.role, agent.name)];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-[760px] flex-col gap-7 px-4 py-8">
          {!loaded && <Loading label="Opening chat…" />}
          {empty && (
            <div className="fade-in flex flex-col items-center gap-3 py-12 text-center">
              <Critter agent={agent} size={72} mood="wave" />
              <p className="eyebrow mt-2">{issueId ? "Say hello" : "New chat"}</p>
              <p className="display text-[30px]">Hi, I&apos;m {agent.name}. What can I do for you?</p>
              <p className="max-w-md text-caption text-body">
                Replies arrive as whole messages. Documents and files I create open on the right.
              </p>
              <div className="mt-3 grid w-full max-w-xl gap-2 sm:grid-cols-3">
                {examples.map((q) => (
                  <button
                    key={q}
                    onClick={() => send(q)}
                    className="card-hover rounded-sm border border-line bg-canvas p-3 text-left text-[14px] leading-snug text-ink"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {comments.map((c) =>
            c.authorAgentId ? (
              <div key={c.id} className="fade-in flex gap-3">
                <Critter agent={agent} size={32} head className="mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="mb-1 font-mono text-[10px] uppercase tracking-[0.22px] text-muted">
                    {agent.name} · {timeAgo(c.createdAt)}
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
              meta={l.status === "sending" ? (issueId ? "Sending…" : "Starting the chat…") : undefined}
              failed={l.status === "failed" ? () => send(l.body, l) : undefined}
            />
          ))}

          {loose.length > 0 && (
            <div className="flex flex-wrap gap-2 pl-11">
              {loose.map((a) => (
                <ArtifactChip key={a.id} artifact={a} active={a.id === openArtifactId} onOpen={onOpenArtifact} />
              ))}
            </div>
          )}

          {busy && !sending && (
            <div className="fade-in flex gap-3" aria-live="polite">
              <Critter agent={agent} size={32} head mood="busy" className="mt-0.5 shrink-0" />
              <div className="pt-1">
                <p className="flex items-center gap-2 text-[14px] text-body">
                  {progress.running ? "Working" : "Thinking"} <Dots />
                </p>
                {progress.lines.map((line, i) => (
                  <p key={i} className="mt-0.5 text-[13px] text-muted">
                    {line}
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mx-auto w-full max-w-[760px] px-4 pb-5">
        {lostConnection && <p className="mb-2 text-[13px] text-body">Paperclip is not reachable right now. Retrying…</p>}
        <div className="flex items-end gap-2 rounded-sm border border-line bg-canvas p-2.5 transition-colors focus-within:border-accent">
          <textarea
            ref={box}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                submit();
              }
            }}
            rows={2}
            placeholder={`Message ${agent.name}…`}
            disabled={!loaded}
            aria-label={`Message ${agent.name}`}
            className="max-h-[220px] min-h-12 flex-1 resize-none bg-transparent px-2 py-1.5 text-body text-ink outline-none placeholder:text-muted"
          />
          <button onClick={submit} disabled={!draft.trim() || !loaded} className="btn btn-primary h-10 uppercase" aria-label="Send">
            Send
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 8h10M9 4l4 4-4 4" />
            </svg>
          </button>
        </div>
        <p className="mt-1.5 text-center font-mono text-[10px] uppercase tracking-[0.22px] text-muted">Enter to send · Shift+Enter for a new line</p>
      </div>
    </div>
  );
}

function UserBubble({ body, meta, failed }: { body: string; meta?: string; failed?: () => void }) {
  return (
    <div className="fade-in flex flex-col items-end">
      <div className={`max-w-[80%] whitespace-pre-wrap rounded-sm bg-accent-soft px-4 py-2.5 text-[15px] text-ink ${failed ? "opacity-70" : ""}`}>
        {body}
      </div>
      {failed ? (
        <p className="mt-1 text-[13px] text-st-error">
          Not sent.{" "}
          <button onClick={failed} className="underline underline-offset-2">
            Retry
          </button>
        </p>
      ) : (
        meta && <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.22px] text-muted">{meta}</p>
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

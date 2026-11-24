"use client";
// One chat session. Paperclip models it as an issue: messages are comments, a reply is a comment with authorAgentId.
// `issueId === null` is a new, not yet created session: the first message creates it (POST .../sessions).
// If a new session gets no reply in time (and no run is going), the chat falls back to the agent's single /chats conversation.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { propFor, type Prop } from "@/components/character/model";
import { api, isUnreachable, newRequestId, timeAgo, usePoll } from "@/lib/client";
import type { Agent, Artifact, ChatSession, Comment, CreateSessionResult, RunProgress } from "@/lib/types";
import { ArtifactChip } from "../artifacts";
import Critter from "../character/Critter";
import { Button, EmptyState, Icon, InlineNotice, Loading, Markdown, Mono, SectionLabel, Unreachable, cardClass } from "../ui";

const FAST_MS = 2500;
const SLOW_MS = 15_000;

type Local = { localId: string; body: string; clientRequestId: string; status: "sending" | "failed"; createdAt: string };

// Keyed by Prop (components/character/model.ts). Must cover every Prop; unknown ones fall back to `laptop`.
const EXAMPLES: Record<Prop, string[]> = {
  briefcase: [
    "Which facility is losing the most leads right now, and where?",
    "How did Catawba's calls and replies look last week?",
    "Write a short revenue summary for this week as a document.",
  ],
  clipboard: ["What's on your list today?", "Which open tasks are overdue?", "Summarise what changed since yesterday."],
  calculator: [
    "How is revenue tracking against last month?",
    "Which facility has the highest cost per move-in?",
    "Write a short finance summary for this week.",
  ],
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
  if (openError) return <EmptyState title="Could not open this chat" text="Please try again in a moment." onRetry={retryOpen} mood="error" />;
  if (fallingBack) return <Loading label="Switching to the main conversation…" />;

  const empty = loaded && comments.length === 0 && local.length === 0;
  const examples = EXAMPLES[propFor(agent.role, agent.name)] ?? EXAMPLES.laptop;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-chat flex-col gap-6 px-4 py-8">
          {!loaded && <Loading label="Opening chat…" />}
          {empty && (
            <div className="fade-in flex flex-col items-center gap-5 py-12 text-center">
              <Critter agent={agent} size={72} mood="wave" />
              <div className="flex flex-col gap-1">
                <SectionLabel>{issueId ? "Say hello" : "New chat"}</SectionLabel>
                <p className="text-2xl font-normal text-foreground">Hi, I&apos;m {agent.name}. What can I do for you?</p>
                <p className="mx-auto max-w-prose text-sm">Replies arrive as whole messages. Documents and files I create open on the right.</p>
              </div>
              <div className="grid w-full gap-2 sm:grid-cols-3">
                {examples.map((q) => (
                  <button key={q} onClick={() => send(q)} className={cardClass("default", true, "p-3 text-sm text-foreground")}>
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {comments.map((c) =>
            c.authorAgentId ? (
              <AgentTurn key={c.id} agent={agent} meta={timeAgo(c.createdAt)}>
                <Markdown>{c.body}</Markdown>
                {byComment.get(c.id)?.length ? (
                  <div className="flex flex-wrap gap-2">
                    {byComment.get(c.id)!.map((a) => (
                      <ArtifactChip key={a.id} artifact={a} active={a.id === openArtifactId} onOpen={onOpenArtifact} />
                    ))}
                  </div>
                ) : null}
              </AgentTurn>
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
            <div className="flex flex-wrap gap-2 pl-8">
              {loose.map((a) => (
                <ArtifactChip key={a.id} artifact={a} active={a.id === openArtifactId} onOpen={onOpenArtifact} />
              ))}
            </div>
          )}

          {busy && !sending && (
            <AgentTurn agent={agent} meta="Working" busy live>
              {progress.lines.length === 0 ? (
                <p className="shimmer text-sm">Thinking</p>
              ) : (
                progress.lines.map((line, i) => (
                  <p key={i} className={i === progress.lines.length - 1 ? "shimmer text-sm" : "text-sm"}>
                    {line}
                  </p>
                ))
              )}
            </AgentTurn>
          )}
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-chat flex-col gap-2 px-4 pb-4">
        {lostConnection && <InlineNotice tone="warning">Paperclip is not reachable right now. Retrying…</InlineNotice>}
        <div className="flex items-end gap-2 rounded-xl border border-control-border bg-background-alt p-2 transition-colors duration-(--motion-duration-fast) focus-within:border-foreground">
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
            className="max-h-composer-max min-h-12 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:shadow-none focus-visible:outline-none"
          />
          <Button variant="primary" size="sm" onClick={submit} disabled={!draft.trim() || !loaded} aria-label="Send">
            Send
            <Icon name="send" className="size-icon-sm" />
          </Button>
        </div>
        <p className="text-center text-xs">Enter to send · Shift+Enter for a new line</p>
      </div>
    </div>
  );
}

/** An agent's turn: avatar and name above the message, on the page surface (left). */
function AgentTurn({
  agent,
  meta,
  busy = false,
  live = false,
  children,
}: {
  agent: Agent;
  meta: string;
  busy?: boolean;
  live?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fade-in flex flex-col gap-2" aria-live={live ? "polite" : undefined}>
      <div className="flex items-center gap-2">
        <Critter agent={agent} size={24} head mood={busy ? "busy" : "idle"} />
        <span className="text-sm font-semibold text-foreground">{agent.name}</span>
        {busy ? <span className="text-xs">{meta}</span> : <Mono>{meta}</Mono>}
      </div>
      <div className="flex flex-col gap-3 pl-8">{children}</div>
    </div>
  );
}

/** The viewer's own message: right-aligned blue bubble with white text. */
function UserBubble({ body, meta, failed }: { body: string; meta?: string; failed?: () => void }) {
  return (
    <div className="fade-in flex flex-col items-end gap-1">
      <div className="max-w-bubble whitespace-pre-wrap rounded-xl bg-bubble-human px-4 py-2 text-sm text-bubble-human-foreground">{body}</div>
      {failed ? (
        <InlineNotice
          tone="error"
          action={
            <Button size="sm" onClick={failed}>
              Retry
            </Button>
          }
        >
          This message was not sent.
        </InlineNotice>
      ) : (
        meta && <Mono>{meta}</Mono>
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

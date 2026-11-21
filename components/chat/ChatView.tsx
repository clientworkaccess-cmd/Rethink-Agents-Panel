"use client";
// Claude-like chat view: sessions sidebar (animated avatar, New chat, sessions grouped by day), the
// conversation in the middle, and the artifact drawer on the right.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { activityOf, isThinking, roleLabel, runFor } from "@/lib/agents";
import { api, isUnreachable, timeAgo, usePoll } from "@/lib/client";
import type { Agent, Artifact, ChatSession, Issue, LiveRun, SessionsPayload } from "@/lib/types";
import { ArtifactDrawer } from "../artifacts";
import Critter from "../character/Critter";
import { ActivityStatus, Button, Icon, IconButton, InlineNotice, Loading, Mono, PageHeader, SectionLabel, Unreachable, buttonClass, cx } from "../ui";
import Conversation from "./Conversation";

const CrewScene = dynamic(() => import("../character/CrewScene"), {
  ssr: false,
  loading: () => <div className="h-full" />,
});

type Meta = Record<string, { title?: string; hidden?: boolean }>;
const META_KEY = "panel-session-meta";
const readMeta = (): Meta => {
  try {
    return JSON.parse(localStorage.getItem(META_KEY) || "{}") as Meta;
  } catch {
    return {};
  }
};
const writeMeta = (m: Meta) => {
  try {
    localStorage.setItem(META_KEY, JSON.stringify(m));
  } catch {
    // storage blocked
  }
};

function group(sessions: ChatSession[]): [string, ChatSession[]][] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const t0 = today.getTime();
  const buckets: Record<string, ChatSession[]> = { Today: [], Yesterday: [], Earlier: [] };
  for (const s of sessions) {
    const t = new Date(s.lastActivityAt ?? s.createdAt ?? 0).getTime();
    (t >= t0 ? buckets.Today : t >= t0 - 86_400_000 ? buckets.Yesterday : buckets.Earlier).push(s);
  }
  return Object.entries(buckets).filter(([, v]) => v.length);
}

export default function ChatView({
  agent,
  agents,
  liveRuns,
  sessionParam,
}: {
  agent: Agent;
  agents: Agent[];
  liveRuns: LiveRun[];
  sessionParam: string | null;
}) {
  const router = useRouter();
  const [payload, setPayload] = useState<SessionsPayload | null>(null);
  const [error, setError] = useState<"unreachable" | "other" | null>(null);
  const [fellBack, setFellBack] = useState(false);
  /** First messages that did not post when their session was created, by issue id (shown with Retry). */
  const [unsent, setUnsent] = useState<Record<string, { body: string; clientRequestId: string }>>({});
  const [artifact, setArtifact] = useState<Artifact | null>(null);
  const [busy, setBusy] = useState(false);
  const [meta, setMeta] = useState<Meta>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- local, per-browser names read after mount
    setMeta(readMeta());
  }, []);

  const loadSessions = useCallback(async () => {
    try {
      setPayload(await api<SessionsPayload>(`/api/agents/${encodeURIComponent(agent.id)}/sessions`));
      setError(null);
    } catch (e) {
      setError(isUnreachable(e) ? "unreachable" : "other");
    }
  }, [agent.id]);
  usePoll(loadSessions, 15_000, [agent.id]);

  const go = useCallback(
    (session: string) => router.replace(`/chat?agent=${encodeURIComponent(agent.id)}&session=${encodeURIComponent(session)}`),
    [router, agent.id],
  );

  const sessionsAvailable = (payload?.sessionsAvailable ?? true) && !fellBack;
  const sessions = useMemo(() => payload?.sessions ?? [], [payload]);
  const visibleSessions = sessions.filter((s) => showAll || !meta[s.issueId]?.hidden);
  const hiddenCount = sessions.filter((s) => meta[s.issueId]?.hidden).length;
  const latest = useMemo(
    () => [...sessions].sort((a, b) => String(b.lastActivityAt).localeCompare(String(a.lastActivityAt)))[0] ?? null,
    [sessions],
  );

  // No session in the URL: continue the latest one, or start a new one.
  const current = sessionParam ?? (payload ? (latest?.issueId ?? "new") : null);
  const active = sessions.find((s) => s.issueId === current) ?? null;

  /** Sessions unavailable: use the single /chats conversation (opens or creates it). */
  const openLegacy = useCallback(async () => {
    setBusy(true);
    try {
      const { issue } = await api<{ issue: Issue }>(`/api/chats/${encodeURIComponent(agent.id)}`, { method: "POST" });
      go(issue.id);
      loadSessions();
    } catch (e) {
      setError(isUnreachable(e) ? "unreachable" : "other");
    } finally {
      setBusy(false);
    }
  }, [agent.id, go, loadSessions]);

  const newChat = () => {
    setArtifact(null);
    if (sessionsAvailable) go("new");
    else void openLegacy();
  };

  // A "new" draft when sessions do not work: go straight to the single conversation.
  useEffect(() => {
    if (current !== "new" || !payload || sessionsAvailable || busy) return;
    const id = setTimeout(() => void openLegacy(), 0);
    return () => clearTimeout(id);
  }, [current, payload, sessionsAvailable, busy, openLegacy]);

  const onCreated = useCallback(
    (session: ChatSession, fallback: boolean, unsent?: { body: string; clientRequestId: string }) => {
      if (fallback) setFellBack(true);
      if (unsent) setUnsent((u) => ({ ...u, [session.issueId]: unsent }));
      setPayload((p) =>
        p && !p.sessions.some((s) => s.issueId === session.issueId) ? { ...p, sessions: [session, ...p.sessions] } : p,
      );
      go(session.issueId);
      loadSessions();
    },
    [go, loadSessions],
  );

  const updateMeta = (issueId: string, patch: { title?: string; hidden?: boolean }) => {
    const next = { ...meta, [issueId]: { ...meta[issueId], ...patch } };
    setMeta(next);
    writeMeta(next);
  };

  const act = activityOf(agent, liveRuns);
  const run = runFor(agent.id, liveRuns);
  const [replying, setReplying] = useState(false);
  const avatarMember = useMemo(
    () => [{ agent, activity: replying ? ("working" as const) : act, thinking: isThinking(run), task: null }],
    [agent, act, run, replying],
  );

  if (error === "unreachable" && !payload) return <Unreachable onRetry={loadSessions} />;

  const activeTitle = active ? meta[active.issueId]?.title || active.title : current === "new" ? "New chat" : null;

  return (
    <div className="flex h-full flex-col">
      <PageHeader
        leading={
          <Link href="/chat" className={buttonClass("ghost", "icon-sm")} aria-label="Back to the lounge" title="Back to the lounge">
            <Icon name="back" />
          </Link>
        }
        title={agent.name}
        meta={
          <span className="inline-flex items-center gap-2">
            <ActivityStatus activity={act} />
            {roleLabel(agent) && <span>· {roleLabel(agent)}</span>}
            {activeTitle && <span className="truncate">· {activeTitle}</span>}
          </span>
        }
        actions={
          <Button variant="primary" size="sm" onClick={newChat} disabled={busy}>
            <Icon name="plus" />
            New chat
          </Button>
        }
      />
      <div className="relative flex min-h-0 flex-1">
        <aside
          className={cx("hidden w-aside-min shrink-0 flex-col border-r border-border", artifact ? "xl:flex" : "md:flex")}
          aria-label="Chat sessions"
        >
          <div className="flex flex-col items-center gap-1 border-b border-border px-4 py-3">
            <div className="relative h-avatar-stage w-full">
              <CrewScene members={avatarMember} bubbles={false} maxHeight={96} />
            </div>
            <ActivityStatus activity={act} />
          </div>
          {!sessionsAvailable && (
            <InlineNotice className="m-3 text-xs">
              Separate chat sessions are unavailable right now, so {agent.name} has one ongoing conversation. Nothing is lost.
            </InlineNotice>
          )}
          <nav className="scroll-quiet min-h-0 flex-1 overflow-y-auto px-3 py-3">
            {!payload ? (
              <Loading compact label="Loading chats…" />
            ) : visibleSessions.length === 0 ? (
              <p className="px-2 text-sm">No chats yet. Start one with New chat.</p>
            ) : (
              group(visibleSessions).map(([label, list]) => (
                <div key={label} className="mb-4">
                  <SectionLabel className="px-2 pb-1">{label}</SectionLabel>
                  <ul className="flex flex-col gap-0.5">
                    {list.map((s) => {
                      const on = s.issueId === current;
                      const title = meta[s.issueId]?.title || s.title;
                      return (
                        <li key={s.issueId} className="group relative">
                          {editing === s.issueId ? (
                            <input
                              autoFocus
                              defaultValue={title}
                              aria-label="Chat name"
                              onBlur={(e) => {
                                updateMeta(s.issueId, { title: e.target.value.trim() || undefined });
                                setEditing(null);
                              }}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                                if (e.key === "Escape") setEditing(null);
                              }}
                              className="h-btn w-full rounded-md border border-control-border bg-background-alt px-2 text-sm text-foreground"
                            />
                          ) : (
                            <button
                              onClick={() => {
                                setArtifact(null);
                                go(s.issueId);
                              }}
                              aria-current={on ? "true" : undefined}
                              className={cx(
                                "flex w-full flex-col gap-0.5 rounded-md px-2 py-2 pr-16 text-left transition-colors duration-(--motion-duration-fast)",
                                on ? "bg-muted-highlight" : "hover:bg-muted",
                              )}
                            >
                              <span className={cx("block truncate text-sm", on ? "font-semibold text-foreground" : "text-foreground/80")}>
                                {meta[s.issueId]?.hidden && <span className="text-muted-foreground">(hidden) </span>}
                                {title}
                              </span>
                              <Mono className="block">
                                {s.legacy ? "Original chat · " : ""}
                                {timeAgo(s.lastActivityAt)}
                              </Mono>
                            </button>
                          )}
                          {editing !== s.issueId && (
                            <span className="absolute right-1 top-1.5 hidden gap-0.5 group-focus-within:flex group-hover:flex">
                              <IconButton label="Rename (only in this browser)" onClick={() => setEditing(s.issueId)}>
                                <Icon name="rename" className="size-icon-sm" />
                              </IconButton>
                              <IconButton
                                label={meta[s.issueId]?.hidden ? "Show again" : "Hide from this list (only in this browser)"}
                                onClick={() => updateMeta(s.issueId, { hidden: !meta[s.issueId]?.hidden })}
                              >
                                <Icon name="hide" className="size-icon-sm" />
                              </IconButton>
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
            {hiddenCount > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Hide hidden chats" : `Show ${hiddenCount} hidden`}
              </Button>
            )}
          </nav>
        </aside>

        <div className="flex min-w-conversation flex-1 flex-col">
          {/* narrow screens: compact session picker */}
          <div className="flex items-center gap-2 border-b border-border p-2 md:hidden">
            <Critter agent={agent} size={26} head />
            <select
              aria-label="Chat session"
              value={current ?? ""}
              onChange={(e) => go(e.target.value)}
              className="h-btn min-w-0 flex-1 rounded-lg border border-control-border bg-background-alt px-2 text-sm text-foreground"
            >
              {sessionsAvailable && <option value="new">New chat</option>}
              {sessions.map((s) => (
                <option key={s.issueId} value={s.issueId}>
                  {meta[s.issueId]?.title || s.title}
                </option>
              ))}
            </select>
          </div>
          {current === null || (current === "new" && !sessionsAvailable) ? (
            <Loading label="Opening chat…" />
          ) : (
            <Conversation
              key={current}
              agent={agent}
              agents={agents}
              issueId={current === "new" ? null : current}
              legacy={active?.legacy ?? false}
              agentRunning={act === "working"}
              replyTimeoutMs={payload?.replyTimeoutMs ?? 180_000}
              openArtifactId={artifact?.id ?? null}
              onOpenArtifact={setArtifact}
              onCreated={onCreated}
              initialUnsent={current === "new" ? null : (unsent[current] ?? null)}
              onFallback={(session) => onCreated(session, true)}
              onReplyingChange={setReplying}
            />
          )}
        </div>

        {artifact && <ArtifactDrawer artifact={artifact} mode="column" onClose={() => setArtifact(null)} />}
      </div>
    </div>
  );
}

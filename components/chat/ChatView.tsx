"use client";
// Claude-like chat view: sessions sidebar (animated avatar, New chat, sessions grouped by day), the
// conversation in the middle, and the artifact drawer on the right.
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ACTIVITY_COLOR, ACTIVITY_LABEL, activityOf, isThinking, roleLabel, runFor } from "@/lib/agents";
import { api, isUnreachable, timeAgo, usePoll } from "@/lib/client";
import type { Agent, Artifact, ChatSession, Issue, LiveRun, SessionsPayload } from "@/lib/types";
import { ArtifactDrawer } from "../artifacts";
import Critter from "../character/Critter";
import { Loading, StatusDot, Unreachable } from "../ui";
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
    (session: ChatSession, fallback: boolean) => {
      if (fallback) setFellBack(true);
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

  return (
    <div className="flex h-full">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-line bg-surface md:flex" aria-label="Chat sessions">
        <div className="relative border-b border-line px-4 pb-3 pt-3">
          <Link href="/chat" className="eyebrow transition-colors hover:text-accent">
            ← Lounge
          </Link>
          <div className="relative mx-auto mt-1 h-[104px] w-full">
            <CrewScene members={avatarMember} bubbles={false} maxHeight={96} />
          </div>
          <p className="display text-center text-[22px]">{agent.name}</p>
          <p className="flex items-center justify-center gap-1.5 text-[13px]" style={{ color: ACTIVITY_COLOR[act] }}>
            <StatusDot activity={act} size={7} />
            {roleLabel(agent) && <span className="text-body">{roleLabel(agent)} ·</span>}
            {ACTIVITY_LABEL[act]}
          </p>
        </div>
        <div className="p-3">
          <button onClick={newChat} disabled={busy} className="btn btn-primary w-full uppercase">
            + New chat
          </button>
          {!sessionsAvailable && (
            <p className="mt-3 rounded-sm border border-line bg-canvas px-3 py-2 text-[12px] leading-snug text-body" role="status">
              Separate chat sessions are unavailable right now, so {agent.name} has one ongoing conversation. Nothing is lost.
            </p>
          )}
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          {!payload ? (
            <Loading compact label="Loading chats…" />
          ) : visibleSessions.length === 0 ? (
            <p className="px-2 text-[13px] text-body">No chats yet. Say hello!</p>
          ) : (
            group(visibleSessions).map(([label, list]) => (
              <div key={label} className="mb-3">
                <p className="eyebrow px-2 pb-1 pt-2">{label}</p>
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
                            className="w-full rounded-sm border border-accent bg-canvas px-2 py-1.5 text-[14px] outline-none"
                          />
                        ) : (
                          <button
                            onClick={() => {
                              setArtifact(null);
                              go(s.issueId);
                            }}
                            className={`w-full rounded-sm border px-2.5 py-2 pr-14 text-left transition-colors ${
                              on ? "border-line bg-canvas" : "border-transparent hover:bg-canvas/70"
                            }`}
                          >
                            <span className={`block truncate text-[14px] ${on ? "font-medium text-ink" : "text-ink"}`}>
                              {meta[s.issueId]?.hidden && <span className="text-muted">(hidden) </span>}
                              {title}
                            </span>
                            <span className="block font-mono text-[10px] uppercase tracking-[0.22px] text-muted">
                              {s.legacy ? "Original chat · " : ""}
                              {timeAgo(s.lastActivityAt)}
                            </span>
                          </button>
                        )}
                        {editing !== s.issueId && (
                          <span className="absolute right-1.5 top-2 hidden gap-0.5 group-hover:flex group-focus-within:flex">
                            <SmallIcon label="Rename (only in this browser)" onClick={() => setEditing(s.issueId)}>
                              <path d="M3 13h3l7-7-3-3-7 7z" />
                            </SmallIcon>
                            <SmallIcon
                              label={meta[s.issueId]?.hidden ? "Show again" : "Hide from this list (only in this browser)"}
                              onClick={() => updateMeta(s.issueId, { hidden: !meta[s.issueId]?.hidden })}
                            >
                              <path d="M2 5h12M4 5v8h8V5M6 3h4" />
                            </SmallIcon>
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
            <button onClick={() => setShowAll((v) => !v)} className="btn btn-ghost px-2 text-[12px]">
              {showAll ? "Hide hidden chats" : `Show ${hiddenCount} hidden`}
            </button>
          )}
        </nav>
      </aside>

      <div className="flex min-w-[300px] flex-1 flex-col">
        {/* narrow screens: compact session picker */}
        <div className="flex items-center gap-2 border-b border-line p-2 md:hidden">
          <Link href="/chat" className="btn btn-ghost px-2" aria-label="Back to the lounge">
            ←
          </Link>
          <Critter agent={agent} size={26} head />
          <select
            aria-label="Chat session"
            value={current ?? ""}
            onChange={(e) => go(e.target.value)}
            className="min-w-0 flex-1 rounded-sm border border-line bg-canvas px-2 py-1.5 text-[14px]"
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
            onFallback={(session) => onCreated(session, true)}
            onReplyingChange={setReplying}
          />
        )}
      </div>

      {artifact && <ArtifactDrawer artifact={artifact} mode="column" onClose={() => setArtifact(null)} />}
    </div>
  );
}

function SmallIcon({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} title={label} aria-label={label} className="rounded-sm p-1 text-muted transition-colors hover:bg-surface hover:text-accent">
      <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

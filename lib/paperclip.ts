// The only module that talks to Paperclip. Server-side only.
// Never import from client components. Base URL and company come from env; PAPERCLIP_MOCK=1 swaps the network for fixtures.
import { mockAttachment, mockRequest } from "./mock";
import {
  asArray,
  attachmentArtifact,
  companyArtifact,
  documentArtifact,
  eventLine,
  eventSeq,
  toAgent,
  toComment,
  toIssue,
  toActivityEvent,
  toLiveRun,
  toRunRecord,
  toUsage,
  type RunRecord,
} from "./normalize";
import type {
  ActivityEvent,
  Agent,
  AgentsPayload,
  Artifact,
  ChatSession,
  Comment,
  CreateSessionResult,
  Issue,
  LiveRun,
  RunProgress,
  SessionsPayload,
} from "./types";

const TIMEOUT_MS = 8000;

export class PaperclipError extends Error {
  constructor(
    public kind: "unreachable" | "upstream" | "config",
    public status = 502,
  ) {
    super(kind === "unreachable" ? "Paperclip is not reachable" : "Paperclip returned an error");
  }
}

const isMock = () => process.env.PAPERCLIP_MOCK === "1";
const baseUrl = () => (process.env.PAPERCLIP_API_URL || "http://127.0.0.1:3100/api").replace(/\/+$/, "");

function companyId(): string {
  const cid = process.env.PAPERCLIP_COMPANY_ID;
  if (!cid && !isMock()) throw new PaperclipError("config", 500);
  return seg(cid || "mock-company");
}

/** Path segments from the browser are restricted to id-like values (no open proxy). */
export function seg(value: string): string {
  if (!/^[A-Za-z0-9._:-]{1,200}$/.test(value) || value.includes("..")) throw new PaperclipError("upstream", 400);
  return encodeURIComponent(value);
}

async function call(method: "GET" | "POST", path: string, body?: unknown): Promise<unknown> {
  if (isMock()) {
    try {
      return await mockRequest(method, path, body);
    } catch (err) {
      const msg = String(err);
      throw new PaperclipError("upstream", msg.includes("mock-400") ? 400 : msg.includes("mock-500") ? 502 : 404);
    }
  }
  let res: Response;
  try {
    res = await fetch(baseUrl() + path, {
      method,
      headers: { Accept: "application/json", ...(body ? { "Content-Type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new PaperclipError("unreachable", 503);
  }
  if (!res.ok) throw new PaperclipError("upstream", res.status === 404 ? 404 : 502);
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new PaperclipError("upstream");
  }
}

const compact = <T>(xs: (T | null)[]) => xs.filter((x): x is T => x !== null);

export async function getAgentsAndRuns(): Promise<AgentsPayload> {
  const cid = companyId();
  const [agents, runs] = await Promise.all([
    call("GET", `/companies/${cid}/agents`),
    call("GET", `/companies/${cid}/live-runs?limit=50`),
  ]);
  return {
    agents: compact<Agent>(asArray(agents, "agents").map(toAgent)),
    liveRuns: compact<LiveRun>(asArray(runs, "runs", "liveRuns").map(toLiveRun)),
  };
}

export async function listIssues(): Promise<Issue[]> {
  const data = await call("GET", `/companies/${companyId()}/issues`);
  return compact<Issue>(asArray(data, "issues").map(toIssue));
}

export async function getIssue(issueId: string): Promise<{ issue: Issue; comments: Comment[] }> {
  const id = seg(issueId);
  const [raw, comments] = await Promise.all([call("GET", `/issues/${id}`), listComments(issueId)]);
  const issue = toIssue((raw && typeof raw === "object" && "issue" in raw ? (raw as { issue: unknown }).issue : raw) as Record<string, unknown>);
  if (!issue) throw new PaperclipError("upstream", 404);
  return { issue, comments };
}

export async function openChat(agentId: string): Promise<Issue> {
  const raw = await call("POST", `/companies/${companyId()}/chats/${seg(agentId)}`, {});
  const obj = (raw && typeof raw === "object" && "issue" in raw ? (raw as { issue: unknown }).issue : raw) as Record<string, unknown>;
  const issue = obj ? toIssue(obj) : null;
  if (!issue) throw new PaperclipError("upstream");
  return issue;
}

export async function listComments(issueId: string, after?: string): Promise<Comment[]> {
  const q = new URLSearchParams({ order: "asc" });
  if (after) q.set("after", seg(after));
  const data = await call("GET", `/issues/${seg(issueId)}/comments?${q}`);
  return compact<Comment>(asArray(data, "comments").map(toComment));
}

export async function postComment(issueId: string, body: string, clientRequestId: string): Promise<Comment> {
  const raw = await call("POST", `/issues/${seg(issueId)}/comments`, { body, clientRequestId });
  const obj = (raw && typeof raw === "object" && "comment" in raw ? (raw as { comment: unknown }).comment : raw) as Record<string, unknown>;
  const c = obj ? toComment(obj) : null;
  if (!c) throw new PaperclipError("upstream");
  return c;
}

export async function getProgress(issueId: string, runId: string | null, afterSeq: number): Promise<RunProgress> {
  const runs = compact<LiveRun>(asArray(await call("GET", `/issues/${seg(issueId)}/live-runs`), "runs", "liveRuns").map(toLiveRun));
  const run = runs[0];
  if (!run) return { running: false, runId: null, lastSeq: 0, lines: [] };
  const from = run.id === runId ? afterSeq : 0;
  const events = asArray(await call("GET", `/heartbeat-runs/${seg(run.id)}/events?afterSeq=${from}`), "events");
  const lines = compact<string>(events.map(eventLine));
  const lastSeq = events.reduce((m, e) => Math.max(m, eventSeq(e)), from);
  return { running: true, runId: run.id, lastSeq, lines };
}

/** Documents and attachments of one issue (a chat). Falls back to the company list. */
export async function listIssueArtifacts(issueId: string): Promise<Artifact[]> {
  const id = seg(issueId);
  try {
    const [docs, atts] = await Promise.all([
      call("GET", `/issues/${id}/documents`),
      call("GET", `/issues/${id}/attachments`),
    ]);
    return [
      ...compact<Artifact>(asArray(docs, "documents").map((d) => documentArtifact(d, issueId))),
      ...compact<Artifact>(asArray(atts, "attachments").map((a) => attachmentArtifact(a, issueId))),
    ];
  } catch (err) {
    if (err instanceof PaperclipError && err.kind === "unreachable") throw err;
    const all = await listRecentArtifacts(100);
    return all.filter((a) => a.issueId === issueId);
  }
}

export async function listRecentArtifacts(limit = 30): Promise<Artifact[]> {
  const data = await call("GET", `/companies/${companyId()}/artifacts?kind=all&limit=${Math.min(limit, 100)}`);
  return compact<Artifact>(asArray(data, "artifacts").map(companyArtifact));
}

export async function getDocument(issueId: string, key: string): Promise<{ title: string; body: string }> {
  const raw = (await call("GET", `/issues/${seg(issueId)}/documents/${seg(key)}`)) as Record<string, unknown> | null;
  const doc = (raw && typeof raw.document === "object" ? raw.document : raw) as Record<string, unknown> | null;
  const body = doc && (doc.body ?? (doc.latestRevision as Record<string, unknown> | undefined)?.body);
  return { title: typeof doc?.title === "string" ? doc.title : key, body: typeof body === "string" ? body : "" };
}

/** Raw upstream response for an attachment's bytes. */
export async function attachmentContent(attachmentId: string, download: boolean): Promise<Response> {
  if (isMock()) {
    const res = await mockAttachment(seg(attachmentId), download);
    if (!res.ok) throw new PaperclipError("upstream", 404);
    return res;
  }
  const path = `/attachments/${seg(attachmentId)}/content${download ? "?download=1" : ""}`;
  let res: Response;
  try {
    res = await fetch(baseUrl() + path, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  } catch {
    throw new PaperclipError("unreachable", 503);
  }
  if (!res.ok) throw new PaperclipError("upstream", res.status === 404 ? 404 : 502);
  return res;
}

// ---------------------------------------------------------------------------------------------
// Chat sessions (brief 02 §4.3): one Paperclip issue per session, assigned to the agent and marked
// as a panel chat in its description. Creating these issues (and waking the agent for them) is the
// ONLY write the panel makes besides chat comments. Everything session-specific is in this block,
// so adjusting it after the real-Paperclip check is a change to this file only.
// ---------------------------------------------------------------------------------------------

/** Marker line in the issue description that identifies a panel chat session. */
export const SESSION_MARKER = "panel-chat-session: v1";
const SESSION_TITLE_PREFIX = "Chat · ";
/** After a failed session (create error or no reply in time), report sessions as unavailable for this long. */
const BROKEN_FOR_MS = 10 * 60_000;

type SessionHealth = { brokenUntil: number };
const g = globalThis as unknown as { __panelSessions?: SessionHealth };
const health: SessionHealth = (g.__panelSessions ??= { brokenUntil: 0 });

/** create (default): wake the agent once, when a session is created. every: also after each message. off: never. */
const wakeMode = () => {
  const v = (process.env.PANEL_CHAT_WAKEUP || "create").toLowerCase();
  return v === "every" || v === "off" ? v : "create";
};

export const replyTimeoutMs = () => {
  const n = Number(process.env.PANEL_SESSION_REPLY_TIMEOUT_MS);
  return Number.isFinite(n) && n >= 10_000 ? n : 180_000;
};

const isSession = (issue: Issue) => issue.description.includes(SESSION_MARKER);

function toSession(issue: Issue, legacy: boolean): ChatSession {
  const title = legacy
    ? "First chat"
    : issue.title.startsWith(SESSION_TITLE_PREFIX)
      ? issue.title.slice(SESSION_TITLE_PREFIX.length)
      : issue.title;
  return {
    issueId: issue.id,
    title: title || "Chat",
    legacy,
    createdAt: issue.createdAt,
    lastActivityAt: issue.updatedAt ?? issue.createdAt,
  };
}

/** The agent must exist and not be terminated: sessions are only ever assigned to a real agent. */
async function requireAgent(agentId: string): Promise<Agent> {
  const data = await call("GET", `/companies/${companyId()}/agents`);
  const agent = compact<Agent>(asArray(data, "agents").map(toAgent)).find((a) => a.id === agentId);
  if (!agent || agent.status === "terminated") throw new PaperclipError("upstream", 404);
  return agent;
}

const unwrapIssue = (o: Record<string, unknown>) =>
  (o.issue && typeof o.issue === "object" ? o.issue : o) as Record<string, unknown>;

/** Paperclip's single `/chats` issue for this agent, if it exists. Read-only (does not create one). */
async function legacyChat(agentId: string): Promise<Issue | null> {
  try {
    const data = await call("GET", `/companies/${companyId()}/chats`);
    const hit = asArray(data, "chats", "issues").map(unwrapIssue).find(
      (o) => o.conversationAgentId === agentId || (o.assigneeAgentId === agentId && "conversationAgentId" in o),
    );
    return hit ? toIssue(hit) : null;
  } catch (err) {
    if (err instanceof PaperclipError && err.kind === "unreachable") throw err;
    return null;
  }
}

/** Sessions with one agent, newest first; the `/chats` conversation (if any) is listed first so no history is lost. */
export async function listChatSessions(agentId: string): Promise<SessionsPayload> {
  const id = seg(agentId);
  const [legacy, issues] = await Promise.all([
    legacyChat(agentId),
    call("GET", `/companies/${companyId()}/issues?assigneeAgentId=${id}`)
      .then((d) => compact<Issue>(asArray(d, "issues").map(toIssue)))
      .catch((err) => {
        if (err instanceof PaperclipError && err.kind === "unreachable") throw err;
        return [] as Issue[];
      }),
  ]);
  const sessions = issues
    .filter((i) => i.assigneeAgentId === agentId && isSession(i) && i.id !== legacy?.id)
    .map((i) => toSession(i, false))
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  return {
    sessions: legacy ? [toSession(legacy, true), ...sessions] : sessions,
    sessionsAvailable: Date.now() >= health.brokenUntil,
    replyTimeoutMs: replyTimeoutMs(),
  };
}

/** Markdown blockquote of a message (every line prefixed), for the session description. */
function quote(text: string): string {
  return text
    .split(/\r?\n/)
    .map((l) => `> ${l}`.trimEnd())
    .join("\n");
}

function sessionTitle(firstMessage: string): string {
  const words = firstMessage.replace(/\s+/g, " ").trim().split(" ").slice(0, 6).join(" ");
  return SESSION_TITLE_PREFIX + (words.length > 60 ? words.slice(0, 57) + "..." : words || "New chat");
}

async function wakeAgent(agentId: string, issueId: string): Promise<void> {
  try {
    await call("POST", `/agents/${seg(agentId)}/wakeup`, {
      source: "on_demand",
      triggerDetail: "manual",
      reason: "panel_chat_message",
      payload: { issueId },
    });
  } catch (err) {
    // Non-fatal: commenting on an assigned issue may already wake the agent. Logged for the VPS check.
    console.warn("[panel] wakeup failed", err instanceof PaperclipError ? `${err.kind} ${err.status}` : err);
  }
}

/**
 * The single entry point for creating a chat session. Creates the session issue (assigned to the
 * agent, with the marker), posts the first message as a comment and wakes the agent. If Paperclip
 * refuses the issue, the message goes to the agent's single `/chats` conversation instead
 * (`fallback: true`), so the chat keeps working.
 */
export async function startChatSession(agentId: string, body: string, clientRequestId: string): Promise<CreateSessionResult> {
  const agent = await requireAgent(agentId);
  let issue: Issue | null = null;
  try {
    const raw = await call("POST", `/companies/${companyId()}/issues`, {
      title: sessionTitle(body),
      // The agent can wake as soon as the issue exists (status todo + assignee), before the first comment
      // lands, so the description carries the full first message too.
      description:
        `Chat session opened from the Agents Panel with ${agent.name}. ` +
        "The conversation is in the comments of this issue: please reply there.\n\n" +
        "First message:\n\n" +
        quote(body) +
        "\n\n" +
        SESSION_MARKER,
      assigneeAgentId: agent.id,
      status: "todo",
    });
    issue = raw && typeof raw === "object" ? toIssue(unwrapIssue(raw as Record<string, unknown>)) : null;
    if (!issue) throw new PaperclipError("upstream");
  } catch (err) {
    if (err instanceof PaperclipError && err.kind === "unreachable") throw err;
    console.warn("[panel] session issue create failed, using /chats", err instanceof PaperclipError ? err.status : err);
    health.brokenUntil = Date.now() + BROKEN_FOR_MS;
    return fallbackToChat(agent.id, body, clientRequestId);
  }
  // the issue exists now: a failed comment must not orphan it, so report it and let the UI retry
  let comment: Comment | null = null;
  try {
    comment = await postComment(issue.id, body, clientRequestId);
  } catch (err) {
    console.warn("[panel] first comment failed on a new session", err instanceof PaperclipError ? `${err.kind} ${err.status}` : err);
  }
  if (wakeMode() !== "off") await wakeAgent(agent.id, issue.id);
  return { session: toSession(issue, false), comment, fallback: false, commentFailed: comment === null };
}

/**
 * Fallback when sessions do not work (create failed, or no reply in time): opens the agent's single
 * `/chats` conversation and posts the message there. Marks sessions unavailable for a while.
 */
export async function fallbackToChat(agentId: string, body: string | null, clientRequestId: string | null): Promise<CreateSessionResult> {
  health.brokenUntil = Date.now() + BROKEN_FOR_MS;
  const chat = await openChat(agentId);
  const comment = body && clientRequestId ? await postComment(chat.id, body, clientRequestId) : null;
  return { session: toSession(chat, true), comment, fallback: true };
}

/** Posts a chat message. With PANEL_CHAT_WAKEUP=every, session issues also get an explicit wakeup. */
export async function postChatMessage(issueId: string, body: string, clientRequestId: string): Promise<Comment> {
  const comment = await postComment(issueId, body, clientRequestId);
  if (wakeMode() === "every") {
    try {
      const { issue } = await getIssue(issueId);
      if (isSession(issue) && issue.assigneeAgentId) await wakeAgent(issue.assigneeAgentId, issue.id);
    } catch {
      // the comment is posted; wakeup is best effort
    }
  }
  return comment;
}

// ---------------------------------------------------------------------------------------------
// Dashboard sources. Each returns null when the endpoint is missing or empty ("Not available").
// ---------------------------------------------------------------------------------------------

async function optional<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (err) {
    if (err instanceof PaperclipError && err.kind === "unreachable") throw err;
    return null;
  }
}

export function getActivity(names: Record<string, string>, limit = 40): Promise<ActivityEvent[] | null> {
  return optional(async () => {
    // most log rows are plumbing that toActivityEvent drops, so read more than we show
    const data = await call("GET", `/companies/${companyId()}/activity?limit=${Math.min(200, limit * 4)}`);
    const rows = asArray(data, "activity", "events", "entries");
    return rows.length ? compact<ActivityEvent>(rows.map((r) => toActivityEvent(r, names))).slice(0, limit) : null;
  });
}

export function getUsageThisMonth(): Promise<{ costCents: number | null; tokens: number | null } | null> {
  return optional(async () => {
    const now = new Date();
    const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
    return toUsage(await call("GET", `/companies/${companyId()}/costs/summary?from=${encodeURIComponent(from)}`));
  });
}

/** Recent heartbeat runs (finished and running). This list endpoint is not in the V1 research: unverified, optional. */
export function listRecentRuns(limit = 500): Promise<RunRecord[] | null> {
  return optional(async () => {
    const data = await call("GET", `/companies/${companyId()}/heartbeat-runs?limit=${limit}`);
    const rows = asArray(data, "runs", "heartbeatRuns");
    return rows.length ? compact<RunRecord>(rows.map(toRunRecord)) : null;
  });
}

export const listIssuesOptional = () => optional(listIssues);
export const listArtifactsOptional = (n = 100) => optional(() => listRecentArtifacts(n));

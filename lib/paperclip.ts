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
  toLiveRun,
} from "./normalize";
import type { Agent, AgentsPayload, Artifact, Comment, Issue, LiveRun, RunProgress } from "./types";

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
      throw new PaperclipError("upstream", String(err).includes("mock-400") ? 400 : 404);
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

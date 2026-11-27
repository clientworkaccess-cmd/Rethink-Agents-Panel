// Defensive mapping from Paperclip JSON to panel types. Field names drift between
// Paperclip releases, so every field tries a few likely names and falls back safely.
import type { ActivityEvent, Agent, AgentStatus, Artifact, Comment, Issue, LiveRun } from "./types";

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

/** Accepts a bare array or an object wrapping one (`{agents: []}`, `{items: []}`, `{data: []}` ...). */
export function asArray(value: unknown, ...keys: string[]): Obj[] {
  if (Array.isArray(value)) return value.filter(isObj);
  if (isObj(value)) {
    for (const k of [...keys, "items", "data", "results"]) {
      if (Array.isArray(value[k])) return (value[k] as unknown[]).filter(isObj);
    }
  }
  return [];
}

function pick(o: Obj, ...paths: string[]): unknown {
  for (const p of paths) {
    let cur: unknown = o;
    for (const part of p.split(".")) cur = isObj(cur) ? cur[part] : undefined;
    if (cur !== undefined && cur !== null && cur !== "") return cur;
  }
  return undefined;
}

const str = (o: Obj, ...paths: string[]) => {
  const v = pick(o, ...paths);
  return typeof v === "string" ? v : typeof v === "number" ? String(v) : null;
};
const num = (o: Obj, ...paths: string[]) => {
  const v = pick(o, ...paths);
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

const STATUSES: AgentStatus[] = ["active", "paused", "idle", "running", "error", "pending_approval", "terminated"];

export function toAgent(o: Obj): Agent | null {
  const id = str(o, "id", "agentId");
  if (!id) return null;
  const raw = (str(o, "status") ?? "").toLowerCase() as AgentStatus;
  return {
    id,
    name: str(o, "name", "displayName", "title") ?? "Agent",
    role: str(o, "role", "roleKey", "title", "kind") ?? "",
    status: STATUSES.includes(raw) ? raw : "unknown",
    lastActivityAt: str(o, "lastHeartbeatAt", "lastActiveAt", "lastRunAt", "updatedAt"),
    reportsTo: str(o, "reportsTo", "reports_to", "reportsToAgentId", "managerId"),
    title: str(o, "title"),
  };
}

const ORG_CHILDREN = ["reports", "children", "directReports"];

/**
 * Flattens Paperclip's `/org` tree ({ id, name, role, status, reports: [...] }, recursive) into
 * agent id -> manager id. Accepts an array of roots, a wrapper object or a single root node.
 * Returns null when nothing usable is found, so the caller can fall back to `reportsTo`.
 */
export function orgParents(value: unknown): Record<string, string | null> | null {
  const roots: Obj[] = Array.isArray(value)
    ? value.filter(isObj)
    : isObj(value) && str(value, "id")
      ? [value]
      : asArray(value, "roots", "nodes", "org", "tree", "agents");
  const parents: Record<string, string | null> = {};
  const walk = (node: Obj, parent: string | null, depth: number) => {
    const id = str(node, "id", "agentId");
    if (!id || id in parents || depth > 50) return;
    parents[id] = parent;
    for (const k of ORG_CHILDREN) {
      if (Array.isArray(node[k])) for (const c of node[k] as unknown[]) if (isObj(c)) walk(c, id, depth + 1);
    }
  };
  for (const r of roots) walk(r, null, 0);
  return Object.keys(parents).length ? parents : null;
}

const FINISHED = ["succeeded", "success", "completed", "done", "failed", "error", "cancelled", "canceled", "timed_out", "timeout"];

export function toLiveRun(o: Obj): LiveRun | null {
  const id = str(o, "id", "runId");
  const agentId = str(o, "agentId", "agent.id");
  if (!id || !agentId) return null;
  const status = (str(o, "status") ?? "running").toLowerCase();
  if (FINISHED.includes(status)) return null;
  return {
    id,
    agentId,
    status,
    issueId: str(o, "issueId", "issue.id", "taskId", "contextSnapshot.issueId"),
    issueTitle: str(o, "issueTitle", "issue.title", "taskTitle", "title", "contextSnapshot.issueTitle"),
    startedAt: str(o, "startedAt", "createdAt"),
    lastOutputAt: str(o, "lastOutputAt", "updatedAt"),
  };
}

export function toIssue(o: Obj): Issue | null {
  const id = str(o, "id");
  if (!id) return null;
  return {
    id,
    identifier: str(o, "identifier", "key"),
    title: str(o, "title", "name") ?? "Untitled",
    description: str(o, "description", "body") ?? "",
    status: (str(o, "status") ?? "unknown").toLowerCase(),
    assigneeAgentId: str(o, "assigneeAgentId", "assignee.id", "assigneeAgent.id", "conversationAgentId"),
    createdAt: str(o, "createdAt"),
    updatedAt: str(o, "updatedAt", "createdAt"),
    completedAt: str(o, "completedAt", "closedAt", "doneAt"),
  };
}

export function toComment(o: Obj): Comment | null {
  const id = str(o, "id");
  if (!id) return null;
  return {
    id,
    body: str(o, "body", "text", "content") ?? "",
    authorAgentId: str(o, "authorAgentId", "authorAgent.id", "agentId"),
    authorUserId: str(o, "authorUserId", "authorUser.id", "userId"),
    createdAt: str(o, "createdAt"),
  };
}

/** One readable line from a heartbeat run event, or null if it has nothing to show. */
export function eventLine(o: Obj): string | null {
  const text = str(
    o,
    "message",
    "summary",
    "text",
    "title",
    "payload.message",
    "payload.summary",
    "payload.text",
    "payload.title",
    "data.message",
    "data.text",
  );
  if (text) return text.replace(/\s+/g, " ").trim().slice(0, 160);
  const tool = str(o, "toolName", "payload.toolName", "payload.name", "data.toolName");
  return tool ? `Using ${tool}` : null;
}

export const eventSeq = (o: Obj) => num(o, "seq", "sequence", "id") ?? 0;

export function documentArtifact(o: Obj, issueId: string, issueTitle: string | null = null): Artifact | null {
  const key = str(o, "key", "documentKey", "slug");
  if (!key) return null;
  return {
    id: `doc:${issueId}:${key}`,
    source: "document",
    title: str(o, "title", "name") ?? key,
    contentType: "text/markdown",
    issueId,
    issueTitle,
    documentKey: key,
    attachmentId: null,
    size: null,
    commentId: str(o, "issueCommentId", "commentId"),
    agentName: str(o, "createdByAgent.name", "authorAgent.name"),
    createdAt: str(o, "createdAt"),
    updatedAt: str(o, "updatedAt", "createdAt"),
  };
}

export function attachmentArtifact(o: Obj, issueId: string | null, issueTitle: string | null = null): Artifact | null {
  const id = str(o, "id", "attachmentId", "assetId");
  if (!id) return null;
  return {
    id: `att:${id}`,
    source: "attachment",
    title: str(o, "originalFilename", "filename", "fileName", "name", "title", "asset.originalFilename") ?? "File",
    contentType: (str(o, "contentType", "mimeType", "asset.contentType") ?? "application/octet-stream").toLowerCase(),
    issueId: str(o, "issueId") ?? issueId,
    issueTitle,
    documentKey: null,
    attachmentId: id,
    size: num(o, "byteSize", "size", "sizeBytes", "asset.byteSize"),
    commentId: str(o, "issueCommentId", "commentId"),
    agentName: str(o, "createdByAgent.name"),
    createdAt: str(o, "createdAt"),
    updatedAt: str(o, "updatedAt", "createdAt"),
  };
}

/** Item from the company-wide `/artifacts` list. */
export function companyArtifact(o: Obj): Artifact | null {
  const source = str(o, "source");
  const issueId = str(o, "issue.id", "issueId");
  const issueTitle = str(o, "issue.title");
  const agentName = str(o, "createdByAgent.name");
  if (source === "document") {
    const key = str(o, "documentKey", "key") ?? keyFromPath(str(o, "contentPath", "href"));
    if (!issueId || !key) return null;
    const a = documentArtifact({ ...o, key }, issueId, issueTitle);
    return a && { ...a, agentName };
  }
  // attachment or work_product pointing at an attachment
  const attachmentId =
    str(o, "attachmentId", "assetId") ?? idFromContentPath(str(o, "contentPath", "openPath", "downloadPath"));
  if (!attachmentId) return null;
  const a = attachmentArtifact({ ...o, id: attachmentId, filename: str(o, "title", "filename") }, issueId, issueTitle);
  return a && { ...a, agentName };
}

function idFromContentPath(path: string | null): string | null {
  const m = path?.match(/attachments\/([^/?#]+)\/content/);
  return m ? decodeURIComponent(m[1]) : null;
}

function keyFromPath(path: string | null): string | null {
  // ".../documents/<key>" (API path) or "...#document-<key>" (Paperclip 2026.1106 UI href, contentPath null)
  const m = path?.match(/documents\/([^/?#]+)/) ?? path?.match(/#document-([^/?#]+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}

/** A finished or running heartbeat run, for the dashboard charts. */
export type RunRecord = {
  id: string;
  agentId: string | null;
  status: string;
  startedAt: string | null;
  finishedAt: string | null;
  /** Input + cached input + output tokens reported on the run (Paperclip 2026.1106 sends them as strings). */
  tokens: number | null;
};

export function toRunRecord(o: Obj): RunRecord | null {
  const id = str(o, "id", "runId");
  if (!id) return null;
  return {
    id,
    agentId: str(o, "agentId", "agent.id"),
    status: (str(o, "status") ?? "unknown").toLowerCase(),
    startedAt: str(o, "startedAt", "createdAt"),
    finishedAt: str(o, "finishedAt", "completedAt", "endedAt"),
    tokens: runTokens(o),
  };
}

export const RUN_OK = ["succeeded", "success", "completed", "done"];
export const RUN_FAILED = ["failed", "error", "timed_out", "timeout"];

/** Token and cost totals from a costs summary, trying the usual field names. */
function runTokens(o: Obj): number | null {
  const total = num(o, "totalTokens");
  if (total !== null) return total;
  const parts = [num(o, "inputTokens"), num(o, "cachedInputTokens"), num(o, "outputTokens")];
  return parts.some((p) => p !== null) ? parts.reduce<number>((a, p) => a + (p ?? 0), 0) : null;
}

export function toUsage(o: unknown): { costCents: number | null; tokens: number | null } | null {
  if (!isObj(o)) return null;
  const src = isObj(o.summary) ? (o.summary as Obj) : o;
  const costCents = num(src, "costCents", "totalCostCents", "spendCents", "total.costCents");
  const input = num(src, "inputTokens", "totalInputTokens", "total.inputTokens") ?? 0;
  const output = num(src, "outputTokens", "totalOutputTokens", "total.outputTokens") ?? 0;
  const cached = num(src, "cachedInputTokens", "cacheReadTokens") ?? 0;
  const total = num(src, "totalTokens", "tokens", "total.tokens");
  const tokens = total ?? (input || output || cached ? input + output + cached : null);
  if (costCents === null && tokens === null) return null;
  return { costCents, tokens };
}

/** Activity actions left out of the feed (verified against Paperclip 2026.1106: most of the log is these). */
const NOISE = /^(tool_gateway\.|environment\.|cost\.|issue\.read_marked|issue\.disposition_|issue\.recovery_action)/;

const ACTION_TEXT: [RegExp, ActivityEvent["kind"], string][] = [
  [/run.*(succeed|complet|finish)/, "finished", "finished"],
  [/run.*(fail|error|timed?_?out)/, "failed", "ran into a problem on"],
  [/run.*(start|queued|running)/, "started", "started"],
  // files first: Paperclip 2026.1106 logs "issue.document_created", which must not read as a new task
  [/(document|attachment|work_?product|artifact)/, "artifact", "saved a file in"],
  [/issue.*creat/, "created", "created"],
  [/comment/, "commented", "commented on"],
  [/issue.*(done|complet|closed)/, "finished", "completed"],
  [/issue.*updat/, "other", "updated"],
];

/** One activity-log row as a plain sentence. `names` maps agent ids to names. */
export function toActivityEvent(o: Obj, names: Record<string, string>): ActivityEvent | null {
  const id = str(o, "id");
  if (!id) return null;
  const action = (str(o, "action", "type", "event", "kind") ?? "").toLowerCase();
  // plumbing events (tool gateway calls, environment leases, read markers, cost reports) are not news for owners
  if (NOISE.test(action)) return null;
  const agentId = str(o, "agentId", "actorAgentId", "actor.agentId", "details.agentId") ??
    (str(o, "actorType") === "agent" ? str(o, "actorId") : null);
  const who = (agentId && names[agentId]) || str(o, "agentName", "actor.name", "actorName") || (agentId ? "An agent" : "You");
  const title = str(o, "details.issueTitle", "details.title", "issue.title", "entityTitle", "title", "details.name", "details.identifier");
  const match = ACTION_TEXT.find(([re]) => re.test(action));
  const kind = match?.[1] ?? "other";
  const verb = match?.[2] ?? (action ? action.replace(/[._]/g, " ") : "did something");
  const text = title ? `${who} ${verb} “${title.slice(0, 80)}”` : `${who} ${verb}`;
  return { id, at: str(o, "createdAt", "at", "timestamp"), agentId, text, kind };
}

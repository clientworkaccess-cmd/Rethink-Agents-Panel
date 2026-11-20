// Defensive mapping from Paperclip JSON to panel types. Field names drift between
// Paperclip releases, so every field tries a few likely names and falls back safely.
import type { Agent, AgentStatus, Artifact, Comment, Issue, LiveRun } from "./types";

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
  };
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
  const m = path?.match(/documents\/([^/?#]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

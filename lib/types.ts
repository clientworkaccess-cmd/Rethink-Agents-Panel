// Panel-side shapes. Paperclip responses are normalised into these in lib/normalize.ts,
// so the UI never depends on Paperclip's exact field names.

export type AgentStatus =
  | "active"
  | "paused"
  | "idle"
  | "running"
  | "error"
  | "pending_approval"
  | "terminated"
  | "unknown";

export type Agent = {
  id: string;
  name: string;
  role: string;
  status: AgentStatus;
  lastActivityAt: string | null;
};

export type LiveRun = {
  id: string;
  agentId: string;
  status: string;
  issueId: string | null;
  issueTitle: string | null;
  startedAt: string | null;
  lastOutputAt: string | null;
};

/** What the panel shows for an agent, derived from its status plus live runs. */
export type Activity = "working" | "idle" | "paused" | "pending" | "error" | "hidden";

export type Issue = {
  id: string;
  identifier: string | null;
  title: string;
  description: string;
  status: string;
  assigneeAgentId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type Comment = {
  id: string;
  body: string;
  authorAgentId: string | null;
  authorUserId: string | null;
  createdAt: string | null;
};

export type RunProgress = {
  running: boolean;
  runId: string | null;
  lastSeq: number;
  lines: string[];
};

export type Artifact = {
  /** Stable key: `doc:<issueId>:<key>` or `att:<attachmentId>`. */
  id: string;
  source: "document" | "attachment";
  title: string;
  contentType: string;
  issueId: string | null;
  issueTitle: string | null;
  documentKey: string | null;
  attachmentId: string | null;
  size: number | null;
  commentId: string | null;
  agentName: string | null;
  createdAt: string | null;
  updatedAt: string | null;
};

export type AgentsPayload = { agents: Agent[]; liveRuns: LiveRun[] };

export type ApiError = { error: string; message: string };

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
  completedAt: string | null;
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

/** One chat conversation with an agent. `legacy` = Paperclip's single `/chats` issue for that agent. */
export type ChatSession = {
  issueId: string;
  title: string;
  legacy: boolean;
  createdAt: string | null;
  lastActivityAt: string | null;
};

export type SessionsPayload = {
  sessions: ChatSession[];
  /** False when multi-session chat is not available: the panel then uses the single `/chats` conversation. */
  sessionsAvailable: boolean;
  /** How long the browser waits for a first reply on a new session before falling back (ms). */
  replyTimeoutMs: number;
};

export type CreateSessionResult = {
  session: ChatSession;
  comment: Comment | null;
  /** True when the session issue could not be created and the message went to the `/chats` conversation instead. */
  fallback: boolean;
};

/** A human-readable activity event. */
export type ActivityEvent = {
  id: string;
  at: string | null;
  agentId: string | null;
  text: string;
  kind: "finished" | "started" | "failed" | "created" | "commented" | "artifact" | "other";
};

export type DayPoint = { day: string; value: number };

/** Dashboard metrics. `null` means "not available" (source missing or empty): never invented. */
export type Metrics = {
  generatedAt: string;
  agents: { working: number; idle: number; errors: number } | null;
  tasks: { open: number; doneLast7d: number } | null;
  runsToday: { total: number; succeeded: number; failed: number } | null;
  artifactsThisWeek: number | null;
  usageThisMonth: { costCents: number | null; tokens: number | null } | null;
  runsPerDay: DayPoint[] | null;
  tasksDonePerDay: DayPoint[] | null;
  perAgent: Record<
    string,
    { runsThisWeek: number | null; tasksDone: number | null; lastActiveAt: string | null; spark: number[] | null }
  >;
  feed: ActivityEvent[] | null;
};

export type ApiError = { error: string; message: string };

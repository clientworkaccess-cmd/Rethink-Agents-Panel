// PAPERCLIP_MOCK=1 fixtures. Answers in Paperclip's JSON shape (so lib/normalize.ts is exercised)
// and keeps state in memory. Every figure here is an illustrative example, not real business data.
//
// PAPERCLIP_MOCK_SESSIONS_FAIL tests the chat-session fallback:
//   1 | create  -> creating a session issue fails (the panel falls back to the single /chats chat)
//   noreply     -> session issues are created but the agent never answers (the panel times out and falls back)

type Obj = Record<string, unknown>;

const CID = "mock-company";
const AGENTS = [
  { id: "agt-cro", name: "CRO", role: "cro", adapterType: "claude_local" },
  { id: "agt-analyst", name: "Pricing Analyst", role: "analyst", adapterType: "claude_local" },
  { id: "agt-ops", name: "Ops Assistant", role: "general", adapterType: "claude_local" },
  { id: "agt-cmo", name: "Marketing Lead", role: "cmo", adapterType: "claude_local" },
];
const MARKER = "panel-chat-session: v1";
const CYCLE_S = 90;
const REPLY_DELAY_MS = 6000;
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

type Pending = { issueId: string; agentId: string; text: string; runId: string; startedAt: number; dueAt: number };
type Store = {
  seq: number;
  issues: Obj[];
  comments: Record<string, Obj[]>;
  documents: Record<string, Obj[]>;
  attachments: Record<string, Obj[]>;
  files: Record<string, { type: string; body: string; name: string }>;
  pending: Pending[];
  activity: Obj[];
  wakeups: Obj[];
};

const iso = (ms: number) => new Date(ms).toISOString();
const failMode = () => (process.env.PAPERCLIP_MOCK_SESSIONS_FAIL || "").toLowerCase();

function seed(): Store {
  const now = Date.now();
  const task = (id: string, n: number, title: string, status: string, agentId: string, ageH: number, description: string, extra: Obj = {}) => ({
    id, identifier: `RSS-${n}`, title, status, assigneeAgentId: agentId, description,
    createdAt: iso(now - (ageH + 24) * HOUR), updatedAt: iso(now - ageH * HOUR),
    completedAt: status === "done" ? iso(now - ageH * HOUR) : null, ...extra,
  });
  const session = (id: string, n: number, agentId: string, title: string, ageH: number) =>
    task(id, n, `Chat · ${title}`, "in_review", agentId, ageH,
      `Chat session opened from the Agents Panel. The conversation is in the comments of this issue: please reply there.\n\n${MARKER}`);
  const issues: Obj[] = [
    task("iss-1", 1, "Weekly occupancy snapshot", "in_progress", "agt-cro", 1,
      "Pull this week's occupancy by unit size and summarise what changed versus last week."),
    task("iss-2", 2, "Review street rates for 10x10 units", "todo", "agt-cro", 5,
      "Compare current street rates for 10x10 units with nearby facilities and suggest whether to adjust."),
    task("iss-3", 3, "Compare competitor pricing within 3 miles", "done", "agt-analyst", 20,
      "List advertised rates for the main unit sizes at competitors within a 3 mile radius."),
    task("iss-4", 4, "Draft move-in promotion ideas", "in_review", "agt-ops", 8,
      "Three promotion ideas for slow-moving unit sizes, with pros and cons for each."),
    task("iss-5", 5, "Tidy the overdue-accounts follow-up list", "blocked", "agt-ops", 30,
      "Group overdue accounts by days late. Blocked: waiting for an export from the management software."),
    task("iss-7", 7, "Plan a spring clean-out email", "in_progress", "agt-cmo", 3,
      "Outline a short email inviting tenants to use the spring clean-out as a moment to resize their unit."),
    task("iss-8", 8, "Summarise last month's move-outs", "done", "agt-cro", 50,
      "Count move-outs by unit size and reason, and note anything unusual."),
    task("iss-9", 9, "Check gate-code reminder wording", "done", "agt-ops", 75,
      "Make the gate-code reminder SMS friendlier and shorter."),
    task("iss-10", 10, "Refresh the unit-size guide page", "done", "agt-cmo", 110,
      "Update the 'which size do I need' guide with simple examples."),
    task("iss-11", 11, "Late-fee policy comparison", "done", "agt-analyst", 140,
      "Compare late-fee policies of nearby facilities (publicly listed only)."),
    {
      id: "chat-agt-cro", identifier: "RSS-6", title: "Chat with CRO", status: "in_review",
      assigneeAgentId: "agt-cro", conversationAgentId: "agt-cro", conversationState: "waiting",
      description: "", createdAt: iso(now - 50 * HOUR), updatedAt: iso(now - 26 * HOUR),
    },
    session("ses-cro-1", 12, "agt-cro", "Occupancy snapshot and rate review", 2),
    session("ses-cro-2", 13, "agt-cro", "Ideas for the 10x20 units", 27),
    session("ses-analyst-1", 14, "agt-analyst", "Competitor rate check", 6),
  ];
  const c = (id: string, body: string, ageMin: number, agentId: string | null) => ({
    id, body, createdAt: iso(now - ageMin * MIN), authorAgentId: agentId, authorUserId: agentId ? null : "local-board",
  });
  const replyAt = now - 118 * MIN;
  const reply2At = now - 27 * 60 * MIN + 2 * MIN;
  return {
    seq: 100,
    issues,
    comments: {
      "chat-agt-cro": [
        c("c-090", "Hi! Can you tell me what you can help with?", 50 * 60, null),
        c("c-091", "Hello. I look after revenue for the facility: occupancy, street rates, promotions and move-in trends. Ask me for a snapshot, a review or a short report and I will save it here for you.\n\n_Mock mode: example reply._", 50 * 60 - 1, "agt-cro"),
      ],
      "ses-cro-1": [
        c("c-001", "Can you give me a quick occupancy snapshot for this week, and a rate review page I can share with the team?", 120, null),
        c("c-002",
          "Here is a first pass. I saved two things for you:\n\n" +
          "- **Occupancy snapshot** (document) with the numbers by unit size\n" +
          "- **Rate review** (HTML page) you can open and share\n\n" +
          "| Unit size | Occupancy | Change vs last week |\n|---|---:|---:|\n" +
          "| 5x5 | 92% | +1 pt |\n| 10x10 | 87% | -2 pts |\n| 10x20 | 79% | 0 pts |\n\n" +
          "The 10x10 dip is the one to watch. I also attached the unit mix as a CSV.\n\n" +
          "_Mock mode: example figures only._", 118, "agt-cro"),
      ],
      "ses-cro-2": [
        c("c-005", "The 10x20 units are filling slowly. What could we try?", 27 * 60, null),
        c("c-006",
          "Three ideas, from cheapest to most effort:\n\n1. **First month at half price** for 10x20 only.\n" +
          "2. **Free move-in truck** on weekends.\n3. **Business-storage angle**: market 10x20 to local trades for tools and stock.\n\n" +
          "I wrote them up as a short plan you can share.\n\n_Mock mode: example ideas only._", 27 * 60 - 2, "agt-cro"),
      ],
      "ses-analyst-1": [
        c("c-007", "How do our 5x5 rates compare with the two closest competitors?", 6 * 60, null),
        c("c-008", "Ours sit roughly in the middle: one competitor lists a little higher, one a little lower. Details in the note.\n\n_Mock mode: example figures only._", 6 * 60 - 1, "agt-analyst"),
      ],
      "iss-1": [
        c("c-010", "Please include the 10x20 units this time.", 600, null),
        c("c-011", "Noted. I will add 10x20 and flag anything that moved more than 2 points.", 590, "agt-cro"),
      ],
      "iss-5": [c("c-020", "Blocked until the overdue-accounts export is available.", 1800, "agt-ops")],
    },
    documents: {
      "ses-cro-1": [{
        key: "occupancy-snapshot", title: "Occupancy snapshot", format: "markdown",
        createdAt: iso(replyAt), updatedAt: iso(replyAt), issueCommentId: "c-002",
        body:
          "# Occupancy snapshot\n\n_Example data for mock mode. Not real figures._\n\n" +
          "## Summary\nOverall occupancy is steady. Small units are nearly full; the 10x10 size slipped two points.\n\n" +
          "## By unit size\n\n| Unit size | Units | Occupied | Occupancy |\n|---|---:|---:|---:|\n" +
          "| 5x5 | 50 | 46 | 92% |\n| 5x10 | 80 | 70 | 88% |\n| 10x10 | 120 | 104 | 87% |\n| 10x20 | 60 | 47 | 79% |\n\n" +
          "## Suggested next steps\n1. Hold 5x5 rates; demand is strong.\n2. Watch 10x10 for another week before changing rates.\n" +
          "3. Consider a first-month promotion on 10x20.\n",
      }],
      "ses-cro-2": [{
        key: "10x20-plan", title: "10x20 fill plan", format: "markdown",
        createdAt: iso(reply2At), updatedAt: iso(reply2At), issueCommentId: "c-006",
        body: "# 10x20 fill plan\n\n_Example content for mock mode._\n\n| Idea | Effort | Cost |\n|---|---|---|\n| Half-price first month | Low | Low |\n| Weekend truck | Medium | Medium |\n| Trades angle | Medium | Low |\n\nStart with the half-price month for four weeks and compare move-ins.\n",
      }],
      "ses-analyst-1": [{
        key: "rate-check", title: "5x5 rate check", format: "markdown",
        createdAt: iso(now - 6 * HOUR), updatedAt: iso(now - 6 * HOUR), issueCommentId: "c-008",
        body: "# 5x5 rate check\n\n_Example data for mock mode._\n\n| Facility | 5x5 monthly |\n|---|---:|\n| Ours | $45 |\n| Competitor A | $49 |\n| Competitor B | $42 |\n",
      }],
      "iss-1": [{
        key: "weekly-notes", title: "Weekly notes", format: "markdown",
        createdAt: iso(now - 590 * MIN), updatedAt: iso(now - 590 * MIN),
        body: "# Weekly notes\n\n_Example data for mock mode._\n\n- Move-ins and move-outs were roughly balanced.\n- Two units came back from maintenance.\n",
      }],
    },
    attachments: {
      "ses-cro-1": [
        { id: "att-rate-review", originalFilename: "rate-review.html", contentType: "text/html", byteSize: 2100, issueCommentId: "c-002", createdAt: iso(replyAt) },
        { id: "att-unit-mix", originalFilename: "unit-mix-sample.csv", contentType: "text/csv", byteSize: 160, issueCommentId: "c-002", createdAt: iso(replyAt) },
      ],
    },
    files: {
      "att-rate-review": { type: "text/html", body: RATE_REVIEW_HTML, name: "rate-review.html" },
      "att-unit-mix": {
        type: "text/csv",
        name: "unit-mix-sample.csv",
        body: "unit_size,units,occupied,street_rate_example\n5x5,50,46,45\n5x10,80,70,70\n10x10,120,104,110\n10x20,60,47,185\n",
      },
    },
    pending: [],
    activity: [
      { id: "act-1", action: "issue.created", actorType: "agent", actorId: "agt-cmo", details: { issueTitle: "Plan a spring clean-out email" }, createdAt: iso(now - 3 * HOUR) },
      { id: "act-2", action: "heartbeat.run.succeeded", actorType: "agent", actorId: "agt-analyst", details: { issueTitle: "Competitor rate check" }, createdAt: iso(now - 6 * HOUR) },
      { id: "act-3", action: "issue.document_updated", actorType: "agent", actorId: "agt-cro", details: { issueTitle: "Occupancy snapshot and rate review" }, createdAt: iso(replyAt) },
      { id: "act-4", action: "issue.comment_added", actorType: "agent", actorId: "agt-ops", details: { issueTitle: "Draft move-in promotion ideas" }, createdAt: iso(now - 8 * HOUR) },
    ],
    wakeups: [],
  };
}

const g = globalThis as unknown as { __panelMock?: Store };
const store = () => (g.__panelMock ??= seed());

function log(s: Store, action: string, agentId: string | null, issueTitle: string, at = Date.now()) {
  s.activity.unshift({ id: `act-${++s.seq}`, action, actorType: agentId ? "agent" : "user", actorId: agentId ?? "local-board", details: { issueTitle }, createdAt: iso(at) });
  s.activity.length = Math.min(s.activity.length, 60);
}

const isChatIssue = (i: Obj | undefined) => !!i && (!!i.conversationAgentId || String(i.description ?? "").includes(MARKER));

/** Turns due fake replies into agent comments. Called on every request. */
function tick(s: Store) {
  const now = Date.now();
  for (const p of s.pending.filter((p) => p.dueAt <= now)) {
    const id = `c-${++s.seq}`;
    const agent = AGENTS.find((a) => a.id === p.agentId);
    const issue = s.issues.find((i) => i.id === p.issueId);
    (s.comments[p.issueId] ??= []).push({
      id, authorAgentId: p.agentId, authorUserId: null, createdAt: iso(p.dueAt), body: fakeReply(p.text, agent?.name ?? "agent"),
    });
    if (issue) issue.updatedAt = iso(p.dueAt);
    if (/report|doc|summary|plan|write|page/i.test(p.text)) {
      (s.documents[p.issueId] ??= []).push({
        key: `notes-${s.seq}`, title: "Follow-up notes", format: "markdown", issueCommentId: id,
        createdAt: iso(p.dueAt), updatedAt: iso(p.dueAt),
        body: `# Follow-up notes\n\n_Example content for mock mode._\n\nYou asked: "${p.text.slice(0, 200)}"\n\n1. Check occupancy by unit size.\n2. Compare street rates with nearby facilities.\n3. Review promotions that ended this month.\n`,
      });
      log(s, "issue.document_updated", p.agentId, String(issue?.title ?? "a chat"), p.dueAt);
    }
    log(s, "heartbeat.run.succeeded", p.agentId, String(issue?.title ?? "a chat"), p.dueAt);
  }
  s.pending = s.pending.filter((p) => p.dueAt > now);
}

function fakeReply(text: string, name: string) {
  const q = text.length > 80 ? text.slice(0, 77) + "..." : text;
  return (
    `Thanks. Here is my short take on *"${q}"*.\n\n**What I would look at first**\n\n` +
    "1. Occupancy by unit size\n2. The gap between street rates and in-place rates\n3. Move-ins versus move-outs over the last 4 weeks\n\n" +
    "| Unit size | Occupancy | Note |\n|---|---:|---|\n| 5x5 | 91% | example |\n| 10x10 | 86% | example |\n| 10x20 | 78% | example |\n\n" +
    `_Mock reply from ${name}: example figures only._`
  );
}

// Each agent follows a repeating schedule (seconds within a 90 s cycle) so every state can be observed:
// run windows (walk + work; "quiet" = no output for a while -> thinking), and status windows.
const WINDOWS: Record<string, { run?: [number, number]; quiet?: [number, number]; status?: [number, number, string][]; task: string }> = {
  "agt-cro": { run: [8, 52], quiet: [30, 44], task: "iss-1" },
  "agt-analyst": { run: [34, 62], status: [[74, 88, "error"]], task: "iss-3" },
  "agt-ops": { run: [52, 74], status: [[0, 16, "pending_approval"]], task: "iss-4" },
  "agt-cmo": { run: [16, 46], status: [[62, 72, "paused"]], task: "iss-7" },
};

function schedule(s: Store) {
  const now = Date.now();
  const t = (now / 1000) % CYCLE_S;
  const cycleStart = now - t * 1000;
  const runs: Obj[] = [];
  const agents = AGENTS.map((a) => {
    const w = WINDOWS[a.id];
    const chat = s.pending.find((p) => p.agentId === a.id);
    const scheduled = w.run && t >= w.run[0] && t < w.run[1];
    let status = "idle";
    if (chat || scheduled) {
      status = "running";
      const issue = s.issues.find((i) => i.id === (chat ? chat.issueId : w.task));
      const quiet = !chat && w.quiet && t >= w.quiet[0] && t < w.quiet[1];
      runs.push({
        id: chat ? chat.runId : `run-${a.id}-${Math.floor(now / (CYCLE_S * 1000))}`,
        agentId: a.id, agentName: a.name, status: "running", issueId: issue?.id,
        issueTitle: issue?.title, startedAt: iso(chat ? chat.startedAt : cycleStart + w.run![0] * 1000),
        lastOutputAt: iso(quiet ? cycleStart + w.quiet![0] * 1000 : now), livenessState: "alive",
      });
    } else {
      for (const [from, to, st] of w.status ?? []) if (t >= from && t < to) status = st;
    }
    return { ...a, companyId: CID, status, lastHeartbeatAt: iso(now - MIN), updatedAt: iso(now - MIN) };
  });
  return { agents, runs };
}

/** Deterministic pseudo-random history: the same numbers on every request for a given day. */
function rand(seedStr: string): number {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) h = Math.imul(h ^ seedStr.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

function runHistory(): Obj[] {
  const out: Obj[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let d = 0; d < 14; d++) {
    const dayStart = today.getTime() - d * DAY;
    const weekend = [0, 6].includes(new Date(dayStart).getDay());
    for (const a of AGENTS) {
      const base = a.id === "agt-cro" ? 7 : a.id === "agt-cmo" ? 4 : 3;
      const n = Math.max(0, Math.round(base * (weekend ? 0.4 : 1) + (rand(`${a.id}:${dayStart}`) - 0.4) * 4));
      for (let k = 0; k < n; k++) {
        const start = dayStart + (7 + rand(`${a.id}:${dayStart}:${k}:h`) * 12) * HOUR;
        if (start > Date.now()) continue;
        const failed = rand(`${a.id}:${dayStart}:${k}:f`) < 0.08;
        out.push({
          id: `hist-${a.id}-${dayStart}-${k}`, agentId: a.id, status: failed ? "failed" : "succeeded",
          startedAt: iso(start), finishedAt: iso(start + (3 + rand(`${a.id}:${k}`) * 10) * MIN),
        });
      }
    }
  }
  return out.sort((x, y) => String(y.startedAt).localeCompare(String(x.startedAt)));
}

function companyArtifacts(s: Store): Obj[] {
  const out: Obj[] = [];
  for (const issue of s.issues) {
    const id = issue.id as string;
    const agent = AGENTS.find((a) => a.id === issue.assigneeAgentId);
    const meta = {
      issue: { id, identifier: issue.identifier, title: issue.title },
      createdByAgent: agent ? { id: agent.id, name: agent.name } : null,
    };
    for (const d of s.documents[id] ?? [])
      out.push({
        id: `doc-${id}-${d.key}`, source: "document", mediaKind: "document", title: d.title, contentType: "text/markdown",
        contentPath: `/api/issues/${id}/documents/${d.key}`, openPath: null, downloadPath: null, createdAt: d.createdAt, updatedAt: d.updatedAt, ...meta,
      });
    for (const a of s.attachments[id] ?? [])
      out.push({
        id: `art-${a.id}`, source: "attachment", mediaKind: "file", title: a.originalFilename, contentType: a.contentType,
        byteSize: a.byteSize, contentPath: `/api/attachments/${a.id}/content`, openPath: `/api/attachments/${a.id}/content`,
        downloadPath: `/api/attachments/${a.id}/content?download=1`, createdAt: a.createdAt, updatedAt: a.createdAt, ...meta,
      });
  }
  return out.sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
}

function runEvents(s: Store, runId: string, afterSeq: number): Obj[] {
  const p = s.pending.find((x) => x.runId === runId);
  const started = p ? p.startedAt : Date.now() - 10_000;
  const all: Obj[] = [
    { seq: 1, type: "status", message: "Reading the conversation" },
    { seq: 2, type: "progress", payload: { message: "Checking occupancy and rate notes" } },
    { seq: 3, type: "tool_call", toolName: "search_documents" },
    { seq: 4, type: "progress", message: "Writing the reply" },
  ];
  const elapsed = Date.now() - started;
  return all.filter((e, i) => (e.seq as number) > afterSeq && elapsed >= i * 1200);
}

export async function mockRequest(method: string, fullPath: string, body?: unknown): Promise<unknown> {
  const s = store();
  tick(s);
  const [path, query = ""] = fullPath.split("?");
  const q = new URLSearchParams(query);
  const m = (re: RegExp) => path.match(re);
  let r: RegExpMatchArray | null;

  if (method === "GET" && m(/^\/companies\/[^/]+\/agents$/)) return schedule(s).agents;
  if (method === "GET" && m(/^\/companies\/[^/]+\/live-runs$/)) return schedule(s).runs;
  if (method === "GET" && m(/^\/companies\/[^/]+\/issues$/)) {
    const assignee = q.get("assigneeAgentId");
    return s.issues.filter((i) => !assignee || i.assigneeAgentId === assignee);
  }
  if (method === "GET" && m(/^\/companies\/[^/]+\/artifacts$/)) return { artifacts: companyArtifacts(s), nextCursor: null };
  if (method === "GET" && m(/^\/companies\/[^/]+\/activity$/)) return s.activity.slice(0, Number(q.get("limit") ?? 40));
  if (method === "GET" && m(/^\/companies\/[^/]+\/heartbeat-runs$/)) return runHistory();
  if (method === "GET" && m(/^\/companies\/[^/]+\/costs\/summary$/))
    // the subscription case: cost 0, tokens still counted (example numbers)
    return { costCents: 0, inputTokens: 1_284_000, outputTokens: 312_500, cachedInputTokens: 4_920_000 };
  if (method === "GET" && m(/^\/companies\/[^/]+\/chats$/))
    return s.issues.filter((i) => i.conversationAgentId).map((issue) => ({ ...issue, unreadCount: 0 }));

  if (method === "POST" && m(/^\/companies\/[^/]+\/issues$/)) {
    const b = (body ?? {}) as Obj;
    if (failMode() === "1" || failMode() === "create") throw new Error("mock-500");
    const agent = AGENTS.find((a) => a.id === b.assigneeAgentId);
    if (!agent || typeof b.title !== "string") throw new Error("mock-400");
    const now = Date.now();
    const issue = {
      id: `ses-${++s.seq}`, identifier: `RSS-${s.seq}`, title: b.title, status: b.status ?? "todo",
      assigneeAgentId: agent.id, description: String(b.description ?? ""), createdAt: iso(now), updatedAt: iso(now),
    };
    s.issues.push(issue);
    log(s, "issue.created", null, b.title);
    return issue;
  }

  if (method === "POST" && (r = m(/^\/agents\/([^/]+)\/wakeup$/))) {
    const agentId = decodeURIComponent(r[1]);
    if (!AGENTS.some((a) => a.id === agentId)) throw new Error("mock-404");
    s.wakeups.push({ agentId, body, at: iso(Date.now()) });
    return { id: `wake-${++s.seq}`, status: "queued" };
  }

  if (method === "POST" && (r = m(/^\/companies\/[^/]+\/chats\/([^/]+)$/))) {
    const agentId = decodeURIComponent(r[1]);
    const agent = AGENTS.find((a) => a.id === agentId);
    if (!agent) throw new Error("mock-404");
    let chat = s.issues.find((i) => i.conversationAgentId === agentId);
    if (!chat) {
      chat = {
        id: `chat-${agentId}`, identifier: `RSS-${++s.seq}`, title: `Chat with ${agent.name}`, status: "in_review",
        assigneeAgentId: agentId, conversationAgentId: agentId, conversationState: "waiting", description: "",
        createdAt: iso(Date.now()), updatedAt: iso(Date.now()),
      };
      s.issues.push(chat);
    }
    return chat;
  }

  if ((r = m(/^\/issues\/([^/]+)(\/.*)?$/))) {
    const id = decodeURIComponent(r[1]);
    const rest = r[2] ?? "";
    const issue = s.issues.find((i) => i.id === id);
    if (!issue) throw new Error("mock-404");
    if (method === "GET" && rest === "") return issue;
    if (method === "GET" && rest === "/comments") {
      const list = s.comments[id] ?? [];
      const after = q.get("after");
      const idx = after ? list.findIndex((c) => c.id === after) : -1;
      return after && idx === -1 ? list : list.slice(idx + 1);
    }
    if (method === "POST" && rest === "/comments") {
      const text = String((body as Obj)?.body ?? "").trim();
      if (!text) throw new Error("mock-400");
      const now = Date.now();
      const comment = { id: `c-${++s.seq}`, body: text, authorAgentId: null, authorUserId: "local-board", createdAt: iso(now) };
      (s.comments[id] ??= []).push(comment);
      issue.updatedAt = iso(now);
      const agentId = (issue.conversationAgentId ?? issue.assigneeAgentId) as string | undefined;
      const silent = failMode() === "noreply" && !issue.conversationAgentId;
      if (agentId && isChatIssue(issue) && !silent)
        s.pending.push({ issueId: id, agentId, text, runId: `run-chat-${s.seq}`, startedAt: now, dueAt: now + REPLY_DELAY_MS });
      return comment;
    }
    if (method === "GET" && rest === "/live-runs") return schedule(s).runs.filter((x) => x.issueId === id);
    if (method === "GET" && rest === "/documents") return (s.documents[id] ?? []).map(({ body: _b, ...d }) => d);
    if (method === "GET" && rest === "/attachments") return s.attachments[id] ?? [];
    if (method === "GET" && (r = rest.match(/^\/documents\/([^/]+)$/))) {
      const doc = (s.documents[id] ?? []).find((d) => d.key === decodeURIComponent(r![1]));
      if (!doc) throw new Error("mock-404");
      return doc;
    }
  }

  if (method === "GET" && (r = m(/^\/heartbeat-runs\/([^/]+)\/events$/)))
    return runEvents(s, decodeURIComponent(r[1]), Number(q.get("afterSeq") ?? 0));

  throw new Error("mock-404");
}

export async function mockAttachment(id: string, download: boolean): Promise<Response> {
  const f = store().files[id];
  if (!f) return new Response("Not found", { status: 404 });
  const headers: Record<string, string> = { "Content-Type": f.type };
  if (download) headers["Content-Disposition"] = `attachment; filename="${f.name}"`;
  return new Response(f.body, { headers });
}

const RATE_REVIEW_HTML = `<!doctype html>
<html><head><meta charset="utf-8"><title>Rate review (example)</title>
<style>
body{font-family:system-ui,sans-serif;background:#fff;color:#272727;margin:0;padding:24px}
h1{font-weight:400;font-size:22px;margin:0 0 4px;font-family:Georgia,serif}p.note{color:#707070;font-size:13px;margin:0 0 20px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:8px 10px;border-bottom:1px solid #e0e0e0;text-align:left}
th{font-weight:500;color:#707070}.bar{height:8px;background:#7451f2;border-radius:4px}
button{margin-top:16px;border:1px solid #a69ea7;background:transparent;border-radius:4px;padding:6px 12px;cursor:pointer}
</style></head><body>
<h1>Street rate review</h1><p class="note">Example data generated in mock mode. Not real figures.</p>
<table><thead><tr><th>Unit size</th><th>Our rate</th><th>Area median</th><th>Occupancy</th></tr></thead><tbody>
<tr><td>5x5</td><td>$45</td><td>$48</td><td><div class="bar" style="width:92%"></div></td></tr>
<tr><td>10x10</td><td>$110</td><td>$105</td><td><div class="bar" style="width:87%"></div></td></tr>
<tr><td>10x20</td><td>$185</td><td>$190</td><td><div class="bar" style="width:79%"></div></td></tr>
</tbody></table>
<button onclick="this.textContent='Scripts run inside the sandbox'">Test interactivity</button>
</body></html>`;

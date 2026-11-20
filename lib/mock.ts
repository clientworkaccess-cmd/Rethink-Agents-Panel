// PAPERCLIP_MOCK=1 fixtures. Answers in Paperclip's JSON shape (so lib/normalize.ts is exercised)
// and keeps state in memory. Every figure here is an illustrative example, not real business data.

type Obj = Record<string, unknown>;

const CID = "mock-company";
const AGENTS = [
  { id: "agt-cro", name: "CRO", role: "cro", adapterType: "claude_local" },
  { id: "agt-analyst", name: "Pricing Analyst", role: "analyst", adapterType: "claude_local" },
  { id: "agt-ops", name: "Ops Assistant", role: "general", adapterType: "claude_local" },
];
const CYCLE_S = 80;
const REPLY_DELAY_MS = 3000;

type Pending = { issueId: string; agentId: string; text: string; runId: string; startedAt: number; dueAt: number };
type Store = {
  seq: number;
  issues: Obj[];
  comments: Record<string, Obj[]>;
  documents: Record<string, Obj[]>;
  attachments: Record<string, Obj[]>;
  files: Record<string, { type: string; body: string; name: string }>;
  pending: Pending[];
};

const iso = (ms: number) => new Date(ms).toISOString();

function seed(): Store {
  const now = Date.now();
  const h = 3600_000;
  const task = (id: string, n: number, title: string, status: string, agentId: string, ageH: number, description: string) => ({
    id, identifier: `RSS-${n}`, title, status, assigneeAgentId: agentId, description,
    createdAt: iso(now - (ageH + 24) * h), updatedAt: iso(now - ageH * h),
  });
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
    {
      id: "chat-agt-cro", identifier: "RSS-6", title: "Chat with CRO", status: "in_review",
      assigneeAgentId: "agt-cro", conversationAgentId: "agt-cro", conversationState: "waiting",
      description: "", createdAt: iso(now - 26 * h), updatedAt: iso(now - 2 * h),
    },
  ];
  const c = (id: string, body: string, ageMin: number, agentId: string | null) => ({
    id, body, createdAt: iso(now - ageMin * 60_000),
    authorAgentId: agentId, authorUserId: agentId ? null : "local-board",
  });
  const replyAt = now - 118 * 60_000;
  return {
    seq: 100,
    issues,
    comments: {
      "chat-agt-cro": [
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
      "iss-1": [
        c("c-010", "Please include the 10x20 units this time.", 600, null),
        c("c-011", "Noted. I will add 10x20 and flag anything that moved more than 2 points.", 590, "agt-cro"),
      ],
      "iss-5": [c("c-020", "Blocked until the overdue-accounts export is available.", 1800, "agt-ops")],
    },
    documents: {
      "chat-agt-cro": [{
        key: "occupancy-snapshot", title: "Occupancy snapshot", format: "markdown",
        createdAt: iso(replyAt), updatedAt: iso(replyAt), issueCommentId: null,
        body:
          "# Occupancy snapshot\n\n_Example data for mock mode. Not real figures._\n\n" +
          "## Summary\nOverall occupancy is steady. Small units are nearly full; the 10x10 size slipped two points.\n\n" +
          "## By unit size\n\n| Unit size | Units | Occupied | Occupancy |\n|---|---:|---:|---:|\n" +
          "| 5x5 | 50 | 46 | 92% |\n| 5x10 | 80 | 70 | 88% |\n| 10x10 | 120 | 104 | 87% |\n| 10x20 | 60 | 47 | 79% |\n\n" +
          "## Suggested next steps\n1. Hold 5x5 rates; demand is strong.\n2. Watch 10x10 for another week before changing rates.\n" +
          "3. Consider a first-month promotion on 10x20.\n",
      }],
      "iss-1": [{
        key: "weekly-notes", title: "Weekly notes", format: "markdown",
        createdAt: iso(now - 590 * 60_000), updatedAt: iso(now - 590 * 60_000),
        body: "# Weekly notes\n\n_Example data for mock mode._\n\n- Move-ins and move-outs were roughly balanced.\n- Two units came back from maintenance.\n",
      }],
    },
    attachments: {
      "chat-agt-cro": [
        { id: "att-rate-review", originalFilename: "rate-review.html", contentType: "text/html", byteSize: 2100,
          issueCommentId: "c-002", createdAt: iso(replyAt) },
        { id: "att-unit-mix", originalFilename: "unit-mix-sample.csv", contentType: "text/csv", byteSize: 160,
          issueCommentId: "c-002", createdAt: iso(replyAt) },
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
  };
}

const g = globalThis as unknown as { __panelMock?: Store };
const store = () => (g.__panelMock ??= seed());

/** Turns due fake replies into agent comments. Called on every request. */
function tick(s: Store) {
  const now = Date.now();
  for (const p of s.pending.filter((p) => p.dueAt <= now)) {
    const id = `c-${++s.seq}`;
    const agent = AGENTS.find((a) => a.id === p.agentId);
    (s.comments[p.issueId] ??= []).push({
      id, authorAgentId: p.agentId, authorUserId: null, createdAt: iso(p.dueAt), body: fakeReply(p.text, agent?.name ?? "agent"),
    });
    if (/report|doc|summary|plan/i.test(p.text)) {
      (s.documents[p.issueId] ??= []).push({
        key: `notes-${s.seq}`, title: "Follow-up notes", format: "markdown", issueCommentId: id,
        createdAt: iso(p.dueAt), updatedAt: iso(p.dueAt),
        body: `# Follow-up notes\n\n_Example content for mock mode._\n\nYou asked: "${p.text.slice(0, 200)}"\n\n1. Check occupancy by unit size.\n2. Compare street rates with nearby facilities.\n3. Review promotions that ended this month.\n`,
      });
    }
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

/** Agent status and live runs follow a repeating schedule so the Office has motion to show. */
function schedule(s: Store) {
  const t = (Date.now() / 1000) % CYCLE_S;
  const chatRun = (agentId: string) => s.pending.find((p) => p.agentId === agentId);
  const windows: Record<string, { run?: [number, number]; status?: [number, number, string][] }> = {
    "agt-cro": { run: [10, 40] },
    "agt-analyst": { run: [30, 60], status: [[70, 80, "error"]] },
    "agt-ops": { run: [50, 70], status: [[0, 20, "pending_approval"]] },
  };
  const taskFor: Record<string, string> = { "agt-cro": "iss-1", "agt-analyst": "iss-3", "agt-ops": "iss-4" };
  const cycleStart = Date.now() - t * 1000;
  const runs: Obj[] = [];
  const agents = AGENTS.map((a) => {
    const w = windows[a.id];
    const chat = chatRun(a.id);
    const scheduled = w.run && t >= w.run[0] && t < w.run[1];
    let status = "idle";
    if (chat || scheduled) {
      status = "running";
      const issue = s.issues.find((i) => i.id === (chat ? chat.issueId : taskFor[a.id]));
      runs.push({
        id: chat ? chat.runId : `run-${a.id}-${Math.floor(Date.now() / (CYCLE_S * 1000))}`,
        agentId: a.id, agentName: a.name, status: "running", issueId: issue?.id,
        issueTitle: issue?.title, startedAt: iso(chat ? chat.startedAt : cycleStart + w.run![0] * 1000),
        lastOutputAt: iso(Date.now()), livenessState: "alive",
      });
    } else {
      for (const [from, to, st] of w.status ?? []) if (t >= from && t < to) status = st;
    }
    return { ...a, companyId: CID, status, lastHeartbeatAt: iso(Date.now() - 60_000), updatedAt: iso(Date.now() - 60_000) };
  });
  return { agents, runs };
}

function companyArtifacts(s: Store): Obj[] {
  const out: Obj[] = [];
  for (const issue of s.issues) {
    const id = issue.id as string;
    const agentId = issue.assigneeAgentId as string;
    const agent = AGENTS.find((a) => a.id === agentId);
    const meta = {
      issue: { id, identifier: issue.identifier, title: issue.title },
      createdByAgent: agent ? { id: agent.id, name: agent.name } : null,
    };
    for (const d of s.documents[id] ?? [])
      out.push({
        id: `doc-${id}-${d.key}`, source: "document", mediaKind: "document", title: d.title, contentType: "text/markdown",
        contentPath: `/api/issues/${id}/documents/${d.key}`, openPath: null, downloadPath: null, updatedAt: d.updatedAt, ...meta,
      });
    for (const a of s.attachments[id] ?? [])
      out.push({
        id: `art-${a.id}`, source: "attachment", mediaKind: "file", title: a.originalFilename, contentType: a.contentType,
        byteSize: a.byteSize, contentPath: `/api/attachments/${a.id}/content`, openPath: `/api/attachments/${a.id}/content`,
        downloadPath: `/api/attachments/${a.id}/content?download=1`, updatedAt: a.createdAt, ...meta,
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
  return all.filter((e, i) => (e.seq as number) > afterSeq && elapsed >= i * 700);
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
  if (method === "GET" && m(/^\/companies\/[^/]+\/issues$/)) return s.issues;
  if (method === "GET" && m(/^\/companies\/[^/]+\/artifacts$/)) return { artifacts: companyArtifacts(s), nextCursor: null };

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
      const comment = { id: `c-${++s.seq}`, body: text, authorAgentId: null, authorUserId: "local-board", createdAt: iso(Date.now()) };
      (s.comments[id] ??= []).push(comment);
      const agentId = issue.conversationAgentId as string | undefined;
      if (agentId) {
        const now = Date.now();
        s.pending.push({ issueId: id, agentId, text, runId: `run-chat-${s.seq}`, startedAt: now, dueAt: now + REPLY_DELAY_MS });
      }
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
body{font-family:system-ui,sans-serif;background:#faf8f5;color:#27251e;margin:0;padding:24px}
h1{font-weight:500;font-size:20px;margin:0 0 4px}p.note{color:#72706b;font-size:13px;margin:0 0 20px}
table{border-collapse:collapse;width:100%;font-size:14px}th,td{padding:8px 10px;border-bottom:1px solid #d1d1cd;text-align:left}
th{font-weight:500;color:#72706b}.bar{height:8px;background:#016a71;border-radius:4px}
button{margin-top:16px;border:1px solid #d1d1cd;background:transparent;border-radius:6px;padding:6px 12px;cursor:pointer}
</style></head><body>
<h1>Street rate review</h1><p class="note">Example data generated in mock mode. Not real figures.</p>
<table><thead><tr><th>Unit size</th><th>Our rate</th><th>Area median</th><th>Occupancy</th></tr></thead><tbody>
<tr><td>5x5</td><td>$45</td><td>$48</td><td><div class="bar" style="width:92%"></div></td></tr>
<tr><td>10x10</td><td>$110</td><td>$105</td><td><div class="bar" style="width:87%"></div></td></tr>
<tr><td>10x20</td><td>$185</td><td>$190</td><td><div class="bar" style="width:79%"></div></td></tr>
</tbody></table>
<button onclick="this.textContent='Scripts run inside the sandbox'">Test interactivity</button>
</body></html>`;

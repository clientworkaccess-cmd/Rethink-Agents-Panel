// Dashboard metrics, computed server-side from Paperclip data only. A metric whose source is missing or
// empty is null, which the UI shows as "Not available". Nothing here is estimated or invented.
import { activityOf } from "./agents";
import { RUN_FAILED, RUN_OK } from "./normalize";
import {
  getActivity,
  getAgentsAndRuns,
  getUsageThisMonth,
  listArtifactsOptional,
  listIssuesOptional,
  listRecentRuns,
  SESSION_MARKER,
} from "./paperclip";
import type { ActivityEvent, DayPoint, Issue, Metrics } from "./types";

const DAY = 86_400_000;
const RUN_LIMIT = 500;
const DONE = ["done", "completed"];
const CLOSED = [...DONE, "cancelled", "canceled"];

const ts = (iso: string | null | undefined) => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : null;
};

/** Local-midnight day keys for the last `n` days, oldest first. */
function lastDays(n: number): { key: string; start: number }[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(today.getTime() - (n - 1 - i) * DAY);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return { key, start: d.getTime() };
  });
}

function perDay(times: number[], n: number): DayPoint[] {
  const days = lastDays(n);
  return days.map((d, i) => {
    const end = i + 1 < days.length ? days[i + 1].start : d.start + DAY;
    return { day: d.key, value: times.filter((t) => t >= d.start && t < end).length };
  });
}

/** Chat issues are conversations, not tasks. */
const isChat = (i: Issue) => i.description.includes(SESSION_MARKER) || /^chat with /i.test(i.title);
const doneAt = (i: Issue) => (DONE.includes(i.status) ? ts(i.completedAt ?? i.updatedAt) : null);

export async function computeMetrics(): Promise<Metrics> {
  const now = Date.now();
  const { agents, liveRuns } = await getAgentsAndRuns();
  const names = Object.fromEntries(agents.map((a) => [a.id, a.name]));
  const [issuesRaw, artifacts, runs, activity, usage] = await Promise.all([
    listIssuesOptional(),
    listArtifactsOptional(100),
    listRecentRuns(RUN_LIMIT),
    getActivity(names, 40),
    getUsageThisMonth(),
  ]);

  const visible = agents.filter((a) => a.status !== "terminated");
  const acts = visible.map((a) => activityOf(a, liveRuns));
  const tasks = issuesRaw?.filter((i) => !isChat(i)) ?? null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekAgo = now - 7 * DAY;

  const runStart = (r: { startedAt: string | null; finishedAt: string | null }) => ts(r.startedAt) ?? ts(r.finishedAt);
  const runsToday = runs?.filter((r) => (runStart(r) ?? 0) >= today.getTime()) ?? null;
  const doneTimes = (tasks ?? []).map(doneAt).filter((t): t is number => t !== null);

  const perAgent: Metrics["perAgent"] = {};
  for (const a of visible) {
    const mine = runs?.filter((r) => r.agentId === a.id) ?? null;
    const myTimes = mine?.map(runStart).filter((t): t is number => t !== null) ?? null;
    const lastRun = myTimes?.length ? new Date(Math.max(...myTimes)).toISOString() : null;
    perAgent[a.id] = {
      runsThisWeek: myTimes ? myTimes.filter((t) => t >= weekAgo).length : null,
      tasksDone: tasks ? tasks.filter((i) => i.assigneeAgentId === a.id && DONE.includes(i.status)).length : null,
      lastActiveAt: [lastRun, a.lastActivityAt].filter(Boolean).sort().at(-1) ?? null,
      spark: myTimes ? perDay(myTimes, 7).map((p) => p.value) : null,
    };
  }

  // Feed: Paperclip's activity log; if that is unavailable, the finished runs (still real data).
  let feed: ActivityEvent[] | null = activity;
  if (!feed && runs?.length) {
    feed = runs
      .filter((r) => RUN_OK.includes(r.status) || RUN_FAILED.includes(r.status))
      .sort((x, y) => String(y.finishedAt ?? y.startedAt).localeCompare(String(x.finishedAt ?? x.startedAt)))
      .slice(0, 20)
      .map((r) => ({
        id: r.id,
        at: r.finishedAt ?? r.startedAt,
        agentId: r.agentId,
        kind: RUN_OK.includes(r.status) ? ("finished" as const) : ("failed" as const),
        text: `${(r.agentId && names[r.agentId]) || "An agent"} ${RUN_OK.includes(r.status) ? "finished a run" : "had a failed run"}`,
      }));
  }

  // Paperclip 2026.1106's costs summary has no token counts; the runs carry them. Summed only when the run
  // list is complete for the month (fewer rows than we asked for), so the figure is never an undercount.
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).getTime();
  const runTokens =
    runs && runs.length < RUN_LIMIT
      ? runs.filter((r) => (runStart(r) ?? 0) >= monthStart && r.tokens !== null).reduce((a, r) => a + (r.tokens ?? 0), 0)
      : null;
  const tokens = usage?.tokens ?? (runTokens || null);
  const usageCard =
    usage && usage.costCents && usage.costCents > 0
      ? { costCents: usage.costCents, tokens }
      : tokens
        ? { costCents: null, tokens }
        : null;

  return {
    generatedAt: new Date(now).toISOString(),
    agents: visible.length
      ? {
          working: acts.filter((x) => x === "working").length,
          idle: acts.filter((x) => x === "idle" || x === "paused" || x === "pending").length,
          errors: acts.filter((x) => x === "error").length,
        }
      : null,
    tasks: tasks?.length
      ? {
          open: tasks.filter((i) => !CLOSED.includes(i.status)).length,
          doneLast7d: doneTimes.filter((t) => t >= weekAgo).length,
        }
      : null,
    runsToday: runsToday
      ? {
          total: runsToday.length,
          succeeded: runsToday.filter((r) => RUN_OK.includes(r.status)).length,
          failed: runsToday.filter((r) => RUN_FAILED.includes(r.status)).length,
        }
      : null,
    artifactsThisWeek: artifacts?.length
      ? artifacts.filter((a) => (ts(a.createdAt ?? a.updatedAt) ?? 0) >= weekAgo).length
      : null,
    usageThisMonth: usageCard,
    runsPerDay: runs ? perDay(runs.map(runStart).filter((t): t is number => t !== null), 14) : null,
    tasksDonePerDay: tasks?.length ? perDay(doneTimes, 14) : null,
    perAgent,
    feed: feed?.length ? feed.slice(0, 25) : null,
  };
}

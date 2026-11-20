"use client";
// Dashboard: key numbers, the team strip (animated characters with status rings), activity chart,
// per-agent cards, live feed, tasks and recent artifacts. Every metric says "Not available" when its
// source returns nothing; nothing is estimated.
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { activityOf, isThinking, roleLabel, runFor } from "@/lib/agents";
import { api, isUnreachable, timeAgo, usePoll } from "@/lib/client";
import type { AgentsPayload, Artifact, Issue, Metrics } from "@/lib/types";
import { ArtifactChip, ArtifactDrawer } from "../artifacts";
import type { CrewMember } from "../character/CrewScene";
import Critter from "../character/Critter";
import { ActivityList, TaskListHeader, TaskRow } from "../lists";
import { ActivityStatus, Button, Card, EmptyState, InlineNotice, Loading, Mono, PageHeader, Segmented, Select, SectionLabel, Unreachable, statusText } from "../ui";
import { ActivityChart, Counter, Sparkline } from "./charts";
import TaskPanel from "./TaskPanel";

const CrewScene = dynamic(() => import("../character/CrewScene"), { ssr: false, loading: () => <Loading compact label="Gathering the team…" /> });

const POLL_MS = 10_000;
const NA = "Not available";

export default function Dashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const agentFilter = params.get("agent") ?? "";
  const [statusFilter, setStatusFilter] = useState("");
  const [data, setData] = useState<AgentsPayload | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [openArtifact, setOpenArtifact] = useState<Artifact | null>(null);
  const tasksRef = useRef<HTMLElement>(null);

  const loadAgents = useCallback(async () => {
    try {
      setData(await api<AgentsPayload>("/api/agents"));
      setUnreachable(false);
    } catch (e) {
      if (isUnreachable(e)) setUnreachable(true);
    }
  }, []);
  usePoll(loadAgents, 5000);

  const load = useCallback(async () => {
    const [m, i, r] = await Promise.allSettled([
      api<Metrics>("/api/metrics"),
      api<{ issues: Issue[] }>("/api/issues"),
      api<{ artifacts: Artifact[] }>("/api/artifacts"),
    ]);
    if (m.status === "fulfilled") setMetrics(m.value);
    if (i.status === "fulfilled") setIssues(i.value.issues);
    if (r.status === "fulfilled") setArtifacts(r.value.artifacts);
  }, []);
  usePoll(load, POLL_MS);

  const agents = useMemo(() => (data?.agents ?? []).filter((a) => a.status !== "terminated"), [data]);
  const members: CrewMember[] = useMemo(
    () =>
      agents.map((agent) => {
        const run = runFor(agent.id, data?.liveRuns ?? []);
        return { agent, activity: activityOf(agent, data?.liveRuns ?? []), thinking: isThinking(run), task: run?.issueTitle ?? null };
      }),
    [agents, data],
  );
  const tasks = useMemo(
    () => (issues ?? []).filter((i) => !/^chat with /i.test(i.title) && !i.description.includes("panel-chat-session")),
    [issues],
  );
  const statuses = useMemo(() => [...new Set(tasks.map((i) => i.status))].sort(), [tasks]);
  const shown = useMemo(
    () =>
      tasks
        .filter((i) => !agentFilter || i.assigneeAgentId === agentFilter)
        .filter((i) => !statusFilter || i.status === statusFilter)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    [tasks, agentFilter, statusFilter],
  );

  const setAgentFilter = (id: string) => router.replace(id ? `/dashboard?agent=${encodeURIComponent(id)}` : "/dashboard", { scroll: false });
  const pickAgent = useCallback(
    (id: string) => {
      router.replace(`/dashboard?agent=${encodeURIComponent(id)}`, { scroll: false });
      setTimeout(() => tasksRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 250);
    },
    [router],
  );
  const closeArtifact = useCallback(() => setOpenArtifact(null), []);

  if (unreachable && !data) return <Unreachable onRetry={loadAgents} />;
  if (!data) return <Loading label="Counting things…" />;

  const m = metrics;
  const usage = m?.usageThisMonth;
  const waiting = members.filter((x) => x.activity === "pending").length;
  const errors = members.filter((x) => x.activity === "error").length;
  const working = members.filter((x) => x.activity === "working").length;

  return (
    <div className="relative flex h-full flex-col">
      <PageHeader
        title="Dashboard"
        meta={
          <>
            {working} working
            {waiting > 0 && ` · ${waiting} waiting for you`}
            {errors > 0 && ` · ${errors} with errors`}
            {` · ${agents.length} agents`}
          </>
        }
      />
      <div className="scroll-quiet min-h-0 flex-1 overflow-y-auto">
        <main className="mx-auto flex max-w-page flex-col gap-8 px-4 py-6 sm:px-6">
          {unreachable && <InlineNotice tone="warning">Paperclip is not reachable. Showing the last data we had.</InlineNotice>}

          {/* key numbers */}
          <section aria-label="Key numbers" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
            <Kpi label="Agents now">
              {m?.agents ? (
                <>
                  <Big>
                    <Counter value={m.agents.working} />
                  </Big>
                  <Sub>
                    working · {m.agents.idle} idle · <span className={m.agents.errors ? "text-destructive" : ""}>{m.agents.errors} with errors</span>
                  </Sub>
                </>
              ) : (
                <Missing />
              )}
            </Kpi>
            <Kpi label="Tasks">
              {m?.tasks ? (
                <>
                  <Big>
                    <Counter value={m.tasks.open} />
                  </Big>
                  <Sub>open · {m.tasks.doneLast7d} done in 7 days</Sub>
                </>
              ) : (
                <Missing />
              )}
            </Kpi>
            <Kpi label="Runs today">
              {m?.runsToday ? (
                <>
                  <Big>
                    <Counter value={m.runsToday.total} />
                  </Big>
                  <Sub>
                    {m.runsToday.succeeded} succeeded · <span className={m.runsToday.failed ? "text-destructive" : ""}>{m.runsToday.failed} failed</span>
                  </Sub>
                </>
              ) : (
                <Missing />
              )}
            </Kpi>
            <Kpi label="Artifacts this week">
              {m?.artifactsThisWeek !== null && m?.artifactsThisWeek !== undefined ? (
                <>
                  <Big>
                    <Counter value={m.artifactsThisWeek} />
                  </Big>
                  <Sub>documents and files</Sub>
                </>
              ) : (
                <Missing />
              )}
            </Kpi>
            {/* cost when it is billed; tokens when the cost is 0 (subscription); hidden when neither exists */}
            {usage && (
              <Kpi label={usage.costCents ? "Cost this month" : "Tokens this month"}>
                {usage.costCents ? (
                  <>
                    <Big>
                      <Counter value={usage.costCents / 100} format={(n) => `$${n.toFixed(2)}`} />
                    </Big>
                    <Sub>{usage.tokens ? `${compact(usage.tokens)} tokens` : "from Paperclip costs"}</Sub>
                  </>
                ) : (
                  <>
                    <Big>
                      <Counter value={usage.tokens ?? 0} format={compact} />
                    </Big>
                    <Sub>cost shows $0 on the subscription</Sub>
                  </>
                )}
              </Kpi>
            )}
          </section>

          {/* team strip */}
          <section aria-label="Team" className="flex flex-col gap-3">
            <SectionHead title="Who is doing what" hint="Click someone to see their tasks." />
            <div className="relative h-strip overflow-hidden rounded-lg border border-border bg-scene-strip">
              {agents.length ? (
                <CrewScene members={members} labels rings maxHeight={120} bubbleWords={3} onPick={pickAgent} />
              ) : (
                <p className="pt-16 text-center text-sm">No agents yet.</p>
              )}
            </div>
          </section>

          <div className="grid gap-8 lg:grid-cols-5">
            <section aria-label="Activity chart" className="flex flex-col gap-3 lg:col-span-3">
              <SectionHead title="Activity" hint="Last 14 days" />
              <Card className="p-4">
                {m && (m.runsPerDay || m.tasksDonePerDay) ? (
                  <ActivityChart runs={m.runsPerDay} done={m.tasksDonePerDay} />
                ) : m ? (
                  <Missing text="Run and task history is not available from Paperclip." />
                ) : (
                  <Loading compact />
                )}
              </Card>
            </section>

            <section aria-label="Live activity" className="flex flex-col gap-3 lg:col-span-2">
              <SectionHead title="What just happened" hint="Live" />
              <Card className="scroll-quiet max-h-feed-max overflow-y-auto">
                {!m ? (
                  <Loading compact />
                ) : !m.feed ? (
                  <div className="p-4">
                    <Missing text="No activity feed from Paperclip." />
                  </div>
                ) : (
                  <ActivityList
                    label="Recent activity"
                    items={m.feed.map((e) => ({ id: e.id, text: e.text, at: e.at, agent: agents.find((x) => x.id === e.agentId) ?? null }))}
                  />
                )}
              </Card>
            </section>
          </div>

          {/* per agent */}
          <section aria-label="Per agent" className="flex flex-col gap-3">
            <SectionHead title="Per agent" hint="This week" />
            <Card className="overflow-hidden">
              <div className="flex h-row items-center gap-3 border-b border-border px-4 text-sm leading-4" aria-hidden>
                <span className="flex-1">Agent</span>
                <span className="hidden w-col-person md:block">Status</span>
                <span className="hidden w-col-num text-right sm:block">Runs</span>
                <span className="hidden w-col-num text-right sm:block">Tasks done</span>
                <span className="w-col-time text-right">Last active</span>
                <span className="hidden w-spark lg:block">Trend</span>
              </div>
              <ul className="divide-y divide-border">
                {agents.map((a) => {
                  const act = activityOf(a, data.liveRuns);
                  const st = m?.perAgent[a.id];
                  return (
                    <li key={a.id}>
                      <button
                        onClick={() => pickAgent(a.id)}
                        className="group flex h-row w-full items-center gap-3 px-4 text-left text-sm leading-4 transition-colors duration-(--motion-duration-fast) hover:bg-muted"
                      >
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <Critter agent={a} size={24} head mood={act === "working" ? "busy" : act === "error" ? "error" : "idle"} />
                          <span className="truncate text-foreground">{a.name}</span>
                          {roleLabel(a) && <span className="hidden truncate text-xs lg:inline">{roleLabel(a)}</span>}
                        </span>
                        <ActivityStatus activity={act} className="hidden w-col-person md:inline-flex" />
                        <Mono className="hidden w-col-num text-right text-sm leading-4 sm:block">{st?.runsThisWeek ?? "—"}</Mono>
                        <Mono className="hidden w-col-num text-right text-sm leading-4 sm:block">{st?.tasksDone ?? "—"}</Mono>
                        <Mono className="w-col-time text-right text-sm leading-4">{st?.lastActiveAt ? timeAgo(st.lastActiveAt) : "—"}</Mono>
                        <span className="hidden w-spark lg:block">{st?.spark ? <Sparkline values={st.spark} /> : <span className="text-xs">{NA}</span>}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          </section>

          {/* tasks */}
          <section ref={tasksRef} aria-label="Tasks" className="flex scroll-mt-4 flex-col gap-3">
            <SectionHead title="Tasks" hint={`${shown.length} shown`} />
            <div className="flex flex-wrap items-center gap-2">
              <Segmented
                label="Status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={[{ value: "", label: "All" }, ...statuses.map((st) => ({ value: st, label: statusText(st) }))]}
              />
              <Select value={agentFilter} onChange={setAgentFilter} label="Agent" className="ml-auto">
                <option value="">All agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
            </div>
            <Card className="overflow-hidden">
              {!issues ? (
                <Loading compact />
              ) : shown.length === 0 ? (
                <EmptyState
                  compact
                  art={false}
                  title="No tasks match these filters"
                  text="Pick another status or agent to see more."
                  action={
                    agentFilter || statusFilter ? (
                      <Button
                        size="sm"
                        onClick={() => {
                          setStatusFilter("");
                          setAgentFilter("");
                        }}
                      >
                        Clear filters
                      </Button>
                    ) : undefined
                  }
                />
              ) : (
                <>
                  <TaskListHeader />
                  <ul className="divide-y divide-border">
                    {shown.map((i) => (
                      <li key={i.id}>
                        <TaskRow issue={i} assignee={agents.find((x) => x.id === i.assigneeAgentId) ?? null} onOpen={() => setOpenTask(i.id)} />
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </Card>
          </section>

          <section aria-label="Recent artifacts" className="flex flex-col gap-3 pb-8">
            <SectionHead title="Recent artifacts" hint="Library" />
            {!artifacts ? (
              <Loading compact />
            ) : artifacts.length === 0 ? (
              <p className="text-sm">Nothing saved yet. Documents and files the agents create show up here.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {artifacts.slice(0, 12).map((a) => (
                  <ArtifactChip key={a.id} artifact={a} active={openArtifact?.id === a.id} onOpen={setOpenArtifact} />
                ))}
              </div>
            )}
          </section>
        </main>
      </div>

      {openTask && <TaskPanel key={openTask} issueId={openTask} agents={agents} onClose={() => setOpenTask(null)} />}
      {openArtifact && <ArtifactDrawer artifact={openArtifact} mode="overlay" onClose={closeArtifact} />}
    </div>
  );
}

const compact = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n));

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Card className="flex flex-col gap-2 p-4">
      <SectionLabel>{label}</SectionLabel>
      <div>{children}</div>
    </Card>
  );
}
const Big = ({ children }: { children: React.ReactNode }) => <p className="font-mono text-2xl tabular-nums text-foreground">{children}</p>;
const Sub = ({ children }: { children: React.ReactNode }) => <p className="mt-1 text-xs">{children}</p>;
function Missing({ text }: { text?: string }) {
  return (
    <>
      <p className="text-base text-muted-foreground">{NA}</p>
      {text && <p className="mt-1 text-xs">{text}</p>}
    </>
  );
}

function SectionHead({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <h2 className="text-base font-semibold text-foreground">{title}</h2>
      {hint && <p className="text-xs">{hint}</p>}
    </div>
  );
}

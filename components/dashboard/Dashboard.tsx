"use client";
// Dashboard: key numbers, the team strip (animated characters with status rings), activity chart,
// per-agent cards, live feed, tasks and recent artifacts. Every metric says "Not available" when its
// source returns nothing; nothing is estimated.
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useRef, useState } from "react";
import { ACTIVITY_COLOR, ACTIVITY_LABEL, activityOf, isThinking, roleLabel, runFor } from "@/lib/agents";
import { api, isUnreachable, timeAgo, usePoll } from "@/lib/client";
import type { AgentsPayload, Artifact, Issue, Metrics } from "@/lib/types";
import { ArtifactChip, ArtifactDrawer } from "../artifacts";
import type { CrewMember } from "../character/CrewScene";
import Critter from "../character/Critter";
import { Loading, StatusDot, StatusPill, Unreachable, statusText } from "../ui";
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
  const nameOf = (id: string | null) => agents.find((a) => a.id === id)?.name ?? "Unassigned";

  if (unreachable && !data) return <Unreachable onRetry={loadAgents} />;
  if (!data) return <Loading label="Counting things…" />;

  const m = metrics;
  const usage = m?.usageThisMonth;

  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto flex max-w-[1200px] flex-col gap-10 px-4 py-8 sm:px-6">
        {unreachable && <p className="rounded-sm border border-line px-4 py-2 text-caption text-body">Paperclip is not reachable. Showing the last data we had.</p>}

        <header>
          <p className="eyebrow">Overview</p>
          <h1 className="display text-[36px]">Dashboard</h1>
        </header>

        {/* key numbers */}
        <section aria-label="Key numbers" className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line md:grid-cols-3 xl:grid-cols-5">
          <Kpi label="Agents now">
            {m?.agents ? (
              <>
                <Big>
                  <Counter value={m.agents.working} />
                </Big>
                <Sub>
                  working · {m.agents.idle} idle · <span className={m.agents.errors ? "text-st-error" : ""}>{m.agents.errors} with errors</span>
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
                  {m.runsToday.succeeded} succeeded · <span className={m.runsToday.failed ? "text-st-error" : ""}>{m.runsToday.failed} failed</span>
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
        <section aria-label="Team">
          <SectionHead eyebrow="The team" title="Who is doing what" />
          <div className="dotgrid relative h-[190px] overflow-hidden rounded-sm border border-line">
            {agents.length ? (
              <CrewScene members={members} labels rings maxHeight={120} onPick={pickAgent} />
            ) : (
              <p className="pt-16 text-center text-caption text-body">No agents yet.</p>
            )}
          </div>
          <p className="mt-2 text-[12px] text-muted">Click someone to see their tasks.</p>
        </section>

        <div className="grid gap-10 lg:grid-cols-[1.6fr_1fr]">
          <section aria-label="Activity chart">
            <SectionHead eyebrow="Last 14 days" title="Activity" />
            <div className="rounded-sm border border-line p-4">
              {m && (m.runsPerDay || m.tasksDonePerDay) ? (
                <ActivityChart runs={m.runsPerDay} done={m.tasksDonePerDay} />
              ) : m ? (
                <Missing text="Run and task history is not available from Paperclip." />
              ) : (
                <Loading compact />
              )}
            </div>
          </section>

          <section aria-label="Live activity">
            <SectionHead eyebrow="Live" title="What just happened" />
            <div className="max-h-[300px] overflow-y-auto rounded-sm border border-line">
              {!m ? (
                <Loading compact />
              ) : !m.feed ? (
                <div className="p-4">
                  <Missing text="No activity feed from Paperclip." />
                </div>
              ) : (
                <ul className="divide-y divide-line">
                  {m.feed.map((e) => {
                    const a = agents.find((x) => x.id === e.agentId);
                    return (
                      <li key={e.id} className="fade-in flex items-center gap-3 px-4 py-2.5">
                        {a ? (
                          <Critter agent={a} size={26} head />
                        ) : (
                          <span className="h-[26px] w-[26px] shrink-0 rounded-full border border-line bg-surface" aria-hidden />
                        )}
                        <span className="min-w-0 flex-1 text-[14px] leading-snug text-ink">{e.text}</span>
                        <span className="shrink-0 font-mono text-[10px] text-muted">{timeAgo(e.at)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </section>
        </div>

        {/* per-agent cards */}
        <section aria-label="Per agent">
          <SectionHead eyebrow="This week" title="Per agent" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {agents.map((a) => {
              const act = activityOf(a, data.liveRuns);
              const s = m?.perAgent[a.id];
              return (
                <button key={a.id} onClick={() => pickAgent(a.id)} className="card-hover rounded-sm border border-line bg-canvas p-4 text-left">
                  <div className="flex items-center gap-3">
                    <Critter agent={a} size={34} head mood={act === "working" ? "busy" : act === "error" ? "error" : "idle"} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[15px] font-medium text-ink">{a.name}</p>
                      <p className="flex items-center gap-1.5 text-[12px]" style={{ color: ACTIVITY_COLOR[act] }}>
                        <StatusDot activity={act} size={6} /> {ACTIVITY_LABEL[act]}
                      </p>
                    </div>
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-y-1 text-[13px]">
                    <dt className="text-body">Runs</dt>
                    <dd className="text-right text-ink">{s?.runsThisWeek ?? <NaText />}</dd>
                    <dt className="text-body">Tasks done</dt>
                    <dd className="text-right text-ink">{s?.tasksDone ?? <NaText />}</dd>
                    <dt className="text-body">Last active</dt>
                    <dd className="text-right text-ink">{s?.lastActiveAt ? timeAgo(s.lastActiveAt) : <NaText />}</dd>
                  </dl>
                  <div className="mt-2 flex items-end justify-between">
                    <span className="eyebrow">{roleLabel(a) || "Agent"}</span>
                    {s?.spark ? <Sparkline values={s.spark} /> : <span className="text-[11px] text-muted">{NA}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* tasks */}
        <section ref={tasksRef} aria-label="Tasks" className="scroll-mt-4">
          <div className="mb-3 flex flex-wrap items-end gap-2">
            <SectionHead eyebrow="Work" title="Tasks" inline />
            <div className="ml-auto flex gap-2">
              <Select value={agentFilter} onChange={setAgentFilter} label="Agent">
                <option value="">All agents</option>
                {agents.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </Select>
              <Select value={statusFilter} onChange={setStatusFilter} label="Status">
                <option value="">All statuses</option>
                {statuses.map((s) => (
                  <option key={s} value={s}>
                    {statusText(s)}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          {!issues ? (
            <Loading compact />
          ) : shown.length === 0 ? (
            <p className="py-3 text-caption text-body">No tasks match these filters.</p>
          ) : (
            <ul className="divide-y divide-line rounded-sm border border-line">
              {shown.map((i) => {
                const a = agents.find((x) => x.id === i.assigneeAgentId);
                return (
                  <li key={i.id}>
                    <button onClick={() => setOpenTask(i.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-surface">
                      {a ? <Critter agent={a} size={24} head /> : <span className="h-6 w-6" />}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[15px] text-ink">{i.title}</span>
                        <span className="block font-mono text-[10px] uppercase tracking-[0.22px] text-muted">
                          {i.identifier && `${i.identifier} · `}
                          {nameOf(i.assigneeAgentId)}
                        </span>
                      </span>
                      <StatusPill status={i.status} />
                      <span className="hidden w-24 text-right font-mono text-[10px] text-muted sm:block">{timeAgo(i.updatedAt)}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section aria-label="Recent artifacts" className="pb-8">
          <SectionHead eyebrow="Library" title="Recent artifacts" />
          {!artifacts ? (
            <Loading compact />
          ) : artifacts.length === 0 ? (
            <p className="text-caption text-body">Nothing saved yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {artifacts.slice(0, 12).map((a) => (
                <ArtifactChip key={a.id} artifact={a} active={openArtifact?.id === a.id} onOpen={setOpenArtifact} />
              ))}
            </div>
          )}
        </section>
      </main>

      {openTask && <TaskPanel key={openTask} issueId={openTask} agents={agents} onClose={() => setOpenTask(null)} />}
      {openArtifact && <ArtifactDrawer artifact={openArtifact} mode="overlay" onClose={closeArtifact} />}
    </div>
  );
}

const compact = (n: number) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(1)}B` : n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(Math.round(n));

function Kpi({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-canvas p-4">
      <p className="eyebrow mb-2">{label}</p>
      {children}
    </div>
  );
}
const Big = ({ children }: { children: React.ReactNode }) => <p className="display text-[36px] leading-none">{children}</p>;
const Sub = ({ children }: { children: React.ReactNode }) => <p className="mt-1.5 text-[13px] text-body">{children}</p>;
const NaText = () => <span className="text-muted">{NA}</span>;
function Missing({ text }: { text?: string }) {
  return (
    <>
      <p className="display text-[22px] text-muted">{NA}</p>
      {text && <p className="mt-1 text-[13px] text-body">{text}</p>}
    </>
  );
}

function SectionHead({ eyebrow, title, inline }: { eyebrow: string; title: string; inline?: boolean }) {
  return (
    <div className={inline ? "" : "mb-3"}>
      <p className="eyebrow">{eyebrow}</p>
      <h2 className="display text-[24px]">{title}</h2>
    </div>
  );
}

function Select({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-sm border border-line bg-canvas px-2 py-1.5 text-[13px] text-ink outline-none transition-colors focus:border-accent"
    >
      {children}
    </select>
  );
}

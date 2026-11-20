"use client";
// Read-only overview: agents, tasks (with filters and a side panel) and recent artifacts. Polls every 10 s.
import { useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ACTIVITY_COLOR, ACTIVITY_LABEL, activityOf, agentColor, hexCss, runFor } from "@/lib/agents";
import { api, isUnreachable, timeAgo, usePoll } from "@/lib/client";
import type { AgentsPayload, Artifact, Issue } from "@/lib/types";
import { ArtifactChip, ArtifactDrawer } from "../artifacts";
import { Avatar, StatusDot, StatusPill, Unreachable, statusText } from "../ui";
import TaskPanel from "./TaskPanel";

const POLL_MS = 10_000;

export default function Dashboard() {
  const router = useRouter();
  const params = useSearchParams();
  const agentFilter = params.get("agent") ?? "";
  const [statusFilter, setStatusFilter] = useState("");
  const [data, setData] = useState<AgentsPayload | null>(null);
  const [issues, setIssues] = useState<Issue[] | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[] | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [openTask, setOpenTask] = useState<string | null>(null);
  const [openArtifact, setOpenArtifact] = useState<Artifact | null>(null);

  const load = useCallback(async () => {
    try {
      const [a, i, r] = await Promise.all([
        api<AgentsPayload>("/api/agents"),
        api<{ issues: Issue[] }>("/api/issues"),
        api<{ artifacts: Artifact[] }>("/api/artifacts"),
      ]);
      setData(a);
      setIssues(i.issues);
      setArtifacts(r.artifacts);
      setUnreachable(false);
    } catch (e) {
      if (isUnreachable(e)) setUnreachable(true);
    }
  }, []);
  usePoll(load, POLL_MS);

  const agents = useMemo(() => (data?.agents ?? []).filter((a) => a.status !== "terminated"), [data]);
  const agentName = (id: string | null) => agents.find((a) => a.id === id)?.name ?? (data?.agents.find((a) => a.id === id)?.name || "Unassigned");
  const statuses = useMemo(() => [...new Set((issues ?? []).map((i) => i.status))].sort(), [issues]);
  const shown = useMemo(
    () =>
      (issues ?? [])
        .filter((i) => !agentFilter || i.assigneeAgentId === agentFilter)
        .filter((i) => !statusFilter || i.status === statusFilter)
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))),
    [issues, agentFilter, statusFilter],
  );

  const setAgentFilter = (id: string) => router.replace(id ? `/dashboard?agent=${encodeURIComponent(id)}` : "/dashboard");
  const closeArtifact = useCallback(() => setOpenArtifact(null), []);

  if (unreachable && !data) return <Unreachable onRetry={load} />;

  return (
    <div className="h-full overflow-y-auto">
      <main className="mx-auto flex max-w-[900px] flex-col gap-8 px-4 py-8">
        {unreachable && <p className="rounded-xl border border-warm-mist px-4 py-2 text-body text-graphite">Paperclip is not reachable. Showing the last data we had.</p>}

        <section>
          <SectionTitle>Agents</SectionTitle>
          {!data ? (
            <Skeleton />
          ) : agents.length === 0 ? (
            <p className="text-body text-graphite">No agents yet.</p>
          ) : (
            <ul className="divide-y divide-warm-mist/70">
              {agents.map((a) => {
                const act = activityOf(a, data.liveRuns);
                const run = runFor(a.id, data.liveRuns);
                return (
                  <li key={a.id} className="flex items-center gap-3 py-3">
                    <Avatar name={a.name} color={hexCss(agentColor(a.id))} />
                    <div className="min-w-0 flex-1">
                      <p className="text-body text-ink">
                        {a.name}
                        {a.role && a.role.toLowerCase() !== a.name.toLowerCase() && <span className="ml-2 text-body-sm text-graphite">{a.role.toUpperCase().length <= 4 ? a.role.toUpperCase() : a.role}</span>}
                      </p>
                      <p className="truncate text-body-sm text-graphite">{run?.issueTitle ? `Working on: ${run.issueTitle}` : " "}</p>
                    </div>
                    <span className="flex items-center gap-1.5 text-body-sm" style={{ color: ACTIVITY_COLOR[act] }}>
                      <StatusDot activity={act} />
                      {ACTIVITY_LABEL[act]}
                    </span>
                    <span className="hidden w-24 text-right text-body-sm text-ash sm:block">{timeAgo(run?.lastOutputAt ?? a.lastActivityAt)}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <SectionTitle inline>Tasks</SectionTitle>
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
            <Skeleton />
          ) : shown.length === 0 ? (
            <p className="py-3 text-body text-graphite">No tasks match these filters.</p>
          ) : (
            <ul className="divide-y divide-warm-mist/70">
              {shown.map((i) => (
                <li key={i.id}>
                  <button onClick={() => setOpenTask(i.id)} className="flex w-full items-center gap-3 rounded-xl py-3 text-left hover:bg-soft-paper">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body text-ink">{i.title}</span>
                      <span className="block text-body-sm text-graphite">
                        {i.identifier && `${i.identifier} · `}
                        {agentName(i.assigneeAgentId)}
                      </span>
                    </span>
                    <StatusPill status={i.status} />
                    <span className="hidden w-24 text-right text-body-sm text-ash sm:block">{timeAgo(i.updatedAt)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle>Recent artifacts</SectionTitle>
          {!artifacts ? (
            <Skeleton />
          ) : artifacts.length === 0 ? (
            <p className="text-body text-graphite">Nothing saved yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {artifacts.slice(0, 12).map((a) => (
                <ArtifactChip key={a.id} artifact={a} active={openArtifact?.id === a.id} onOpen={setOpenArtifact} />
              ))}
            </div>
          )}
        </section>
      </main>

      {openTask && <TaskPanel key={openTask} issueId={openTask} agentName={agentName} onClose={() => setOpenTask(null)} />}
      {openArtifact && <ArtifactDrawer artifact={openArtifact} mode="overlay" onClose={closeArtifact} />}
    </div>
  );
}

function SectionTitle({ children, inline }: { children: React.ReactNode; inline?: boolean }) {
  return <h2 className={`text-body-sm uppercase tracking-wide text-graphite ${inline ? "" : "mb-3"}`}>{children}</h2>;
}

function Select({ value, onChange, label, children }: { value: string; onChange: (v: string) => void; label: string; children: React.ReactNode }) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="rounded-md border border-warm-mist bg-parchment px-2 py-1.5 text-body-sm text-ink outline-none"
    >
      {children}
    </select>
  );
}

function Skeleton() {
  return (
    <div className="flex flex-col gap-3 py-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-4 animate-pulse rounded bg-warm-mist/40" style={{ width: `${80 - i * 15}%` }} />
      ))}
    </div>
  );
}

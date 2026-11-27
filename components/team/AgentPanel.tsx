"use client";
// Team tab side panel: one agent's place in the team (manager, direct reports), what it is doing now,
// and links to its chat and tasks. Read-only, like the rest of the panel.
import Link from "next/link";
import { useEffect } from "react";
import { ACTIVITY_LABEL, roleLabel } from "@/lib/agents";
import type { Activity, Agent, LiveRun } from "@/lib/types";
import Critter from "../character/Critter";
import { ActivityStatus, IconButton, Icon, SectionLabel, buttonClass, cx } from "../ui";
import { moodFor } from "./mood";

type Props = {
  agent: Agent;
  activity: Activity;
  run: LiveRun | undefined;
  manager: Agent | null;
  reports: Agent[];
  activityOf: (a: Agent) => Activity;
  onSelect: (id: string) => void;
  onClose: () => void;
};

function PersonRow({ agent, activity, onSelect }: { agent: Agent; activity: Activity; onSelect: (id: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onSelect(agent.id)}
      className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors duration-(--motion-duration-fast) hover:bg-muted-highlight"
    >
      <Critter agent={agent} size={28} head mood={moodFor(activity)} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-foreground">{agent.name}</span>
        <span className="block truncate text-xs">{agent.title || roleLabel(agent) || ACTIVITY_LABEL[activity]}</span>
      </span>
      <ActivityStatus activity={activity} />
    </button>
  );
}

export default function AgentPanel({ agent, activity, run, manager, reports, activityOf, onSelect, onClose }: Props) {
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [onClose]);

  const subtitle = agent.title || roleLabel(agent);
  return (
    <aside
      aria-label={`${agent.name} details`}
      className="slide-in-right absolute inset-y-0 right-0 z-20 flex w-full max-w-chat flex-col border-l border-border bg-background shadow-flyout sm:w-aside"
    >
      <div className="flex items-center justify-end px-3 pt-3">
        <IconButton label="Close" onClick={onClose}>
          <Icon name="close" />
        </IconButton>
      </div>
      <div className="scroll-quiet flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 pb-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <Critter agent={agent} size={72} mood={moodFor(activity)} />
          <div className="flex flex-col gap-0.5">
            <h2 className="text-lg font-semibold text-foreground">{agent.name}</h2>
            {subtitle && <p className="text-sm">{subtitle}</p>}
          </div>
          <ActivityStatus activity={activity} />
        </div>

        <section className="flex flex-col gap-2">
          <SectionLabel as="h3">Right now</SectionLabel>
          <p className={cx("rounded-lg bg-muted px-3 py-2 text-sm", run?.issueTitle ? "text-foreground" : "")}>
            {run?.issueTitle ?? (activity === "working" ? "Working on something" : "No task running")}
          </p>
        </section>

        <section className="flex flex-col gap-1">
          <SectionLabel as="h3" className="pb-1">
            Reports to
          </SectionLabel>
          {manager ? (
            <PersonRow agent={manager} activity={activityOf(manager)} onSelect={onSelect} />
          ) : (
            <p className="px-2 text-sm">Nobody: top of the team</p>
          )}
        </section>

        <section className="flex flex-col gap-1">
          <SectionLabel as="h3" className="pb-1">
            Direct reports · {reports.length}
          </SectionLabel>
          {reports.length ? (
            reports.map((r) => <PersonRow key={r.id} agent={r} activity={activityOf(r)} onSelect={onSelect} />)
          ) : (
            <p className="px-2 text-sm">No one reports to {agent.name} yet</p>
          )}
        </section>
      </div>
      <div className="flex gap-2 border-t border-border px-5 py-4">
        <Link href={`/chat?agent=${encodeURIComponent(agent.id)}`} className={buttonClass("primary", "md", "flex-1")}>
          <Icon name="chat" />
          Chat
        </Link>
        <Link href={`/dashboard?agent=${encodeURIComponent(agent.id)}`} className={buttonClass("secondary", "md", "flex-1")}>
          <Icon name="dashboard" />
          Tasks
        </Link>
      </div>
    </aside>
  );
}

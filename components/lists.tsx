"use client";
// Shared list compositions (DESIGN.md task rows, task-list columns and activity lists).
// Rows are 44px (comfortable) or 32px (compact), 14px text with a 16px line height; machine values in mono.
import { timeAgo } from "@/lib/client";
import type { Agent, Issue } from "@/lib/types";
import Critter from "./character/Critter";
import { Mono, StatusIcon, cx } from "./ui";

export type Density = "comfortable" | "compact";
const ROW_H: Record<Density, string> = { comfortable: "h-row", compact: "h-row-compact" };

/* ---------------------------------------------------------------- Task list */

/** Column header: Task, Task ID, Assignee, Last updated (default visible set plus assignee). */
export function TaskListHeader() {
  return (
    <div className="flex h-row items-center gap-3 border-b border-border px-4 text-sm leading-4 text-muted-foreground" aria-hidden>
      <span className="flex-1 pl-6">Task</span>
      <span className="hidden w-col-time sm:block">Task ID</span>
      <span className="hidden w-col-person md:block">Assignee</span>
      <span className="w-col-time text-right">Last updated</span>
    </div>
  );
}

/**
 * One task: status icon (label in its tooltip), title on one line with ellipsis, then ID, assignee and
 * last-updated columns. Read-style title (regular, muted); hover promotes the row background and title.
 */
export function TaskRow({
  issue,
  assignee,
  onOpen,
  density = "comfortable",
}: {
  issue: Issue;
  assignee: Agent | null;
  onOpen: () => void;
  density?: Density;
}) {
  return (
    <button
      onClick={onOpen}
      aria-label={issue.title}
      className={cx(
        "group flex w-full items-center gap-3 px-4 text-left text-sm leading-4 transition-colors duration-(--motion-duration-fast) hover:bg-muted focus-visible:bg-muted",
        ROW_H[density],
      )}
    >
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <StatusIcon status={issue.status} />
        <span className="truncate text-muted-foreground group-hover:text-foreground group-focus-visible:text-foreground">{issue.title}</span>
      </span>
      <Mono className="hidden w-col-time truncate text-sm leading-4 sm:block">{issue.identifier ?? "—"}</Mono>
      <span className="hidden w-col-person min-w-0 items-center gap-2 md:flex">
        {assignee ? <Critter agent={assignee} size={20} head /> : null}
        <span className="truncate">{assignee?.name ?? "Unassigned"}</span>
      </span>
      <Mono className="w-col-time text-right text-sm leading-4">{timeAgo(issue.updatedAt)}</Mono>
    </button>
  );
}

/* ---------------------------------------------------------------- Activity list */

export type ActivityItem = { id: string; text: string; at: string | null; agent: Agent | null };

export function ActivityRow({ item, density = "comfortable" }: { item: ActivityItem; density?: Density }) {
  return (
    <li className={cx("ticker-in flex items-center gap-3 text-sm leading-4", ROW_H[density], density === "comfortable" ? "px-4" : "px-3")}>
      {item.agent ? (
        <Critter agent={item.agent} size={density === "compact" ? 20 : 24} head />
      ) : (
        <span className={cx("shrink-0 rounded-full bg-muted-highlight", density === "compact" ? "size-5" : "size-6")} aria-hidden />
      )}
      <span className="min-w-0 flex-1 truncate text-foreground" title={item.text}>
        {item.text}
      </span>
      <Mono className="shrink-0">{timeAgo(item.at)}</Mono>
    </li>
  );
}

export function ActivityList({ items, density = "comfortable", label }: { items: ActivityItem[]; density?: Density; label: string }) {
  return (
    <ul aria-label={label} className={cx(density === "comfortable" && "divide-y divide-border")}>
      {items.map((item) => (
        <ActivityRow key={item.id} item={item} density={density} />
      ))}
    </ul>
  );
}

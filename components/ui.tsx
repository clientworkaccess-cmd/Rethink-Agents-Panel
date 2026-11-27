"use client";
// The panel's shared UI primitives. One component per job (DESIGN.md principle 1): variants are props.
// Visual values come only from the token layer in app/globals.css (principle 2).
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ACTIVITY_LABEL } from "@/lib/agents";
import type { Activity } from "@/lib/types";
import Critter, { type CritterMood } from "./character/Critter";

/** A stand-in character for loading, empty and error states (not tied to an agent). */
const HELPER = { id: "panel-helper-3", role: "general", name: "helper" };

export const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ");

/* ---------------------------------------------------------------- Button */

export type ButtonVariant = "primary" | "secondary" | "ghost" | "destructive";
export type ButtonSize = "sm" | "md" | "control" | "icon-sm" | "icon";

const BTN_BASE =
  "inline-flex shrink-0 select-none items-center justify-center gap-2 rounded-lg text-sm font-semibold whitespace-nowrap " +
  "transition-[background-color,color,border-color,opacity] duration-(--motion-duration-fast) ease-(--motion-ease-standard) " +
  "disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";
const BTN_VARIANT: Record<ButtonVariant, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  secondary: "border border-control-border bg-background text-foreground hover:bg-muted-highlight",
  ghost: "font-normal text-muted-foreground hover:bg-muted-highlight hover:text-foreground",
  destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
};
const BTN_SIZE: Record<ButtonSize, string> = {
  sm: "h-btn-sm px-3",
  md: "h-btn px-4",
  control: "h-control px-4",
  "icon-sm": "size-btn-sm",
  icon: "size-btn",
};

/** Classes for anything that should look like a button (links, download anchors). */
export function buttonClass(variant: ButtonVariant = "secondary", size: ButtonSize = "md", className?: string) {
  return cx(BTN_BASE, BTN_VARIANT[variant], BTN_SIZE[size], className);
}

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={buttonClass(variant, size, className)} {...props} />;
}

/** Square icon-only button. The label is the accessible name and the tooltip. */
export function IconButton({
  label,
  size = "icon-sm",
  variant = "ghost",
  className,
  children,
  ...props
}: Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children"> & {
  label: string;
  size?: "icon-sm" | "icon" | "control";
  variant?: ButtonVariant;
  children: React.ReactNode;
}) {
  return (
    <Button
      variant={variant}
      size={size}
      aria-label={label}
      title={label}
      className={cx(size === "control" && "w-control px-0", className)}
      {...props}
    >
      {children}
    </Button>
  );
}

/* ---------------------------------------------------------------- Icons (stroke icons on a 16px grid) */

const ICONS = {
  close: "m4 4 8 8M12 4l-8 8",
  expand: "M2 6V2h4M14 10v4h-4",
  restore: "M6 2v4H2M10 14v-4h4",
  back: "M10 3 5 8l5 5",
  plus: "M8 3v10M3 8h10",
  minus: "M3 8h10",
  team: "M6 2h4v3H6zM2 11h4v3H2zM10 11h4v3h-4zM8 5v3M4 11V8h8v3",
  chevronDown: "m4 6 4 4 4-4",
  chevronRight: "m6 4 4 4-4 4",
  send: "M3 8h10M9 4l4 4-4 4",
  download: "M8 2v8M4.5 7 8 10.5 11.5 7M3 13.5h10",
  rename: "M3 13h3l7-7-3-3-7 7z",
  hide: "M2 5h12M4 5v8h8V5M6 3h4",
  fit: "M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4",
  office: "M2 14V6l6-4 6 4v8M6 14V9h4v5",
  dashboard: "M2 2h5v6H2zM9 2h5v3H9zM9 7h5v7H9zM2 10h5v4H2z",
  chat: "M2.5 3.5h11v7h-6l-3 2.5v-2.5h-2z",
  logout: "M6 2.5H3v11h3M10 5l3 3-3 3M13 8H6",
  sidebar: "M2 3h12v10H2zM6 3v10",
  sun: "M8 5.2a2.8 2.8 0 1 0 0 5.6 2.8 2.8 0 0 0 0-5.6M8 1.5v1.3M8 13.2v1.3M1.5 8h1.3M13.2 8h1.3M3.4 3.4l.9.9M11.7 11.7l.9.9M3.4 12.6l.9-.9M11.7 4.3l.9-.9",
  moon: "M13.5 9.6A5.5 5.5 0 1 1 6.4 2.5a4.5 4.5 0 0 0 7.1 7.1z",
  soundOn: "M2.5 6.3h2.4l3-2.4v8.2l-3-2.4H2.5zM10.4 6a2.7 2.7 0 0 1 0 4M12.1 4.3a5 5 0 0 1 0 7.4",
  soundOff: "M2.5 6.3h2.4l3-2.4v8.2l-3-2.4H2.5zM10.6 6.3l3.4 3.4M14 6.3l-3.4 3.4",
  mic: "M8 2a2 2 0 0 0-2 2v3.5a2 2 0 0 0 4 0V4a2 2 0 0 0-2-2M4 7.5a4 4 0 0 0 8 0M8 11.5V14M5.5 14h5",
  micOff: "M8 2a2 2 0 0 0-2 2v3.5a2 2 0 0 0 4 0V4a2 2 0 0 0-2-2M4 7.5a4 4 0 0 0 8 0M8 11.5V14M5.5 14h5M2.5 2.5l11 11",
  stop: "M4.5 4.5h7v7h-7z",
  headset: "M3 10V8a5 5 0 0 1 10 0v2M3 10h2.5v3.5H3zM10.5 10H13v3.5h-2.5z",
} as const;
export type IconName = keyof typeof ICONS;

export function Icon({ name, className = "size-icon" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d={ICONS[name]} />
    </svg>
  );
}

/* ---------------------------------------------------------------- Card */

export type Elevation = "default" | "low" | "middle" | "high";
const ELEVATION: Record<Elevation, string> = {
  default: "bg-background",
  low: "bg-background",
  middle: "bg-muted-alt",
  high: "bg-muted",
};

/** Surface levels share the translucent border and add no shadow (DESIGN.md color foundation). */
export function cardClass(elevation: Elevation = "default", interactive = false, className?: string) {
  return cx(
    "rounded-lg border border-border",
    ELEVATION[elevation],
    interactive && "text-left transition-colors duration-(--motion-duration-fast) hover:bg-muted-highlight",
    className,
  );
}

export function Card({
  elevation = "default",
  interactive = false,
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { elevation?: Elevation; interactive?: boolean }) {
  return <div className={cardClass(elevation, interactive, className)} {...props} />;
}

/** Floating surfaces (popovers, hover cards, tooltips): background, border, 8px radius, flyout shadow. */
export const flyoutClass = "rounded-lg border border-border bg-background shadow-flyout";

/* ---------------------------------------------------------------- Status (one vocabulary everywhere) */

export type Tone = "working" | "waiting" | "idle" | "paused" | "error" | "done";

const TONE_BG: Record<Tone, string> = {
  working: "bg-status-working",
  waiting: "bg-status-waiting",
  idle: "bg-status-idle",
  paused: "bg-status-paused",
  error: "bg-status-error",
  done: "bg-status-done",
};
const TONE_TEXT: Record<Tone, string> = {
  working: "text-status-working",
  waiting: "text-status-waiting",
  idle: "text-status-idle",
  paused: "text-status-paused",
  error: "text-status-error",
  done: "text-status-done",
};

export const activityTone = (a: Activity): Tone =>
  a === "working" ? "working" : a === "pending" ? "waiting" : a === "error" ? "error" : a === "paused" ? "paused" : "idle";

/** Task statuses map onto the same tones as agents. */
export function taskTone(status: string): Tone {
  switch (status) {
    case "in_progress":
      return "working";
    case "in_review":
    case "pending_approval":
      return "waiting";
    case "blocked":
      return "error";
    case "done":
    case "completed":
      return "done";
    case "cancelled":
      return "paused";
    default:
      return "idle";
  }
}

export function statusText(s: string) {
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}

export function StatusDot({ tone, label }: { tone: Tone; label?: string }) {
  return <span aria-label={label} role={label ? "img" : undefined} className={cx("inline-block size-dot shrink-0 rounded-full", TONE_BG[tone])} />;
}

/** Dot + words for an agent's activity. */
export function ActivityStatus({ activity, className }: { activity: Activity; className?: string }) {
  return (
    <span className={cx("inline-flex items-center gap-2 text-xs", className)}>
      <StatusDot tone={activityTone(activity)} />
      {ACTIVITY_LABEL[activity]}
    </span>
  );
}

/** Task status icon; its label is the tooltip and the accessible name. */
export function StatusIcon({ status }: { status: string }) {
  const tone = taskTone(status);
  const label = statusText(status);
  return (
    <svg viewBox="0 0 16 16" className={cx("size-icon shrink-0", TONE_TEXT[tone])} role="img" aria-label={label}>
      <title>{label}</title>
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={tone === "idle" ? "2.4 2" : undefined} />
      {tone === "working" && <path d="M8 4a4 4 0 0 1 0 8z" fill="currentColor" />}
      {tone === "waiting" && <circle cx="8" cy="8" r="2" fill="currentColor" />}
      {tone === "done" && <path d="m5.4 8.2 1.8 1.8 3.4-3.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />}
      {tone === "error" && <path d="M8 5v3.4M8 10.6v.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
      {tone === "paused" && <path d="M5.5 8h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />}
    </svg>
  );
}

/** Small label chip: muted-foreground on muted-highlight (tags, status words, flags). */
export function Badge({ children, tone, className, title }: { children: React.ReactNode; tone?: Tone; className?: string; title?: string }) {
  return (
    <span title={title} className={cx("inline-flex h-tab-compact shrink-0 items-center gap-1.5 rounded-md bg-muted-highlight px-2 text-xs text-muted-foreground", className)}>
      {tone && <StatusDot tone={tone} />}
      {children}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={taskTone(status)}>{statusText(status)}</Badge>;
}

/* ---------------------------------------------------------------- Text helpers */

/** Machine values (IDs, times, counts, costs) always use the mono token. */
export function Mono({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={cx("font-mono text-xs tabular-nums", className)}>{children}</span>;
}

export function SectionLabel({ children, className, as: As = "p" }: { children: React.ReactNode; className?: string; as?: "p" | "h2" | "h3" }) {
  return <As className={cx("label-caps", className)}>{children}</As>;
}

/** Agent Markdown. Raw HTML is not rendered (react-markdown escapes it by default). `doc` = standalone document scale. */
export function Markdown({ children, doc = false }: { children: string; doc?: boolean }) {
  return (
    <div className={cx("md", doc && "md-doc")}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{ a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" /> }}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

/* ---------------------------------------------------------------- Page structure */

/** The 60px page header: title at the left, one line of state, actions at the right. */
export function PageHeader({
  title,
  meta,
  actions,
  leading,
  className,
}: {
  title: React.ReactNode;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  leading?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cx("flex h-header shrink-0 items-center gap-3 border-b border-border bg-background px-4 sm:px-6", className)}>
      {leading}
      <div className="flex min-w-0 items-baseline gap-3">
        <h1 className="truncate text-xl font-normal text-foreground">{title}</h1>
        {meta && <p className="hidden truncate text-xs sm:block">{meta}</p>}
      </div>
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Collection toolbar: controls 44px high with an 8px gap; search/filters first, primary action last. */
export function Toolbar({ children, className, label }: { children: React.ReactNode; className?: string; label?: string }) {
  return (
    <div role="toolbar" aria-label={label} className={cx("flex flex-wrap items-center gap-2", className)}>
      {children}
    </div>
  );
}

export function Select({
  value,
  onChange,
  label,
  children,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={cx("h-control rounded-lg border border-control-border bg-background-alt px-3 text-sm text-foreground", className)}
    >
      {children}
    </select>
  );
}

/**
 * Exclusive filter choices (DESIGN.md "TabFilters" / segmented control): radio semantics, roving focus,
 * filled selection, never clears the current choice. `compact` = 24px / xs, standard = 32px / sm.
 */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
  compact = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
  compact?: boolean;
}) {
  const move = (dir: 1 | -1, from: HTMLElement) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + dir + options.length) % options.length];
    if (!next) return;
    onChange(next.value);
    const buttons = from.closest('[role="radiogroup"]')?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
    buttons?.[(i + dir + options.length) % options.length]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex max-w-full flex-wrap items-center gap-1 rounded-lg bg-muted p-1"
      onKeyDown={(e) => {
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
          e.preventDefault();
          move(1, e.target as HTMLElement);
        }
        if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
          e.preventDefault();
          move(-1, e.target as HTMLElement);
        }
      }}
    >
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            className={cx(
              "rounded-md transition-colors duration-(--motion-duration-fast)",
              compact ? "h-tab-compact px-2 text-xs" : "h-tab px-2.5 text-sm",
              on ? "bg-background text-foreground shadow-flyout" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------------------------------------------------------------- Feedback */

/**
 * Inline notice in place of toasts (DESIGN.md contextual feedback): padded, rounded, tinted surface,
 * an icon and foreground text. `error` = destructive tint; `warning` = amber; `neutral` = muted.
 */
export function InlineNotice({
  tone = "neutral",
  children,
  action,
  className,
}: {
  tone?: "neutral" | "warning" | "error";
  children: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}) {
  const surface = tone === "error" ? "bg-destructive-soft" : tone === "warning" ? "bg-warning-soft" : "bg-muted";
  const icon = tone === "error" ? "text-destructive" : tone === "warning" ? "text-warning" : "text-muted-foreground";
  return (
    <div role={tone === "neutral" ? "status" : "alert"} className={cx("flex items-start gap-2 rounded-lg px-3 py-2 text-sm text-foreground", surface, className)}>
      <svg viewBox="0 0 16 16" className={cx("mt-0.5 size-icon shrink-0", icon)} aria-hidden>
        <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" strokeWidth="1.4" />
        <path d={tone === "neutral" ? "M8 7.2v3.6M8 5.2v.1" : "M8 4.8v3.6M8 10.8v.1"} stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <div className="min-w-0 flex-1">{children}</div>
      {action}
    </div>
  );
}

/** Empty, error and "not found" states: a character, what happened, what to do first. */
export function EmptyState({
  title,
  text,
  action,
  onRetry,
  mood = "idle",
  art = true,
  compact = false,
}: {
  title: string;
  text?: string;
  action?: React.ReactNode;
  onRetry?: () => void;
  mood?: CritterMood;
  art?: boolean;
  compact?: boolean;
}) {
  return (
    <div className={cx("fade-in flex flex-col items-center justify-center gap-5 px-6 text-center", compact ? "py-6" : "py-12")}>
      {art && <Critter agent={HELPER} size={compact ? 36 : 48} mood={mood} />}
      <div className="flex flex-col gap-1">
        <p className="text-base font-semibold text-foreground">{title}</p>
        {text && <p className="mx-auto max-w-prose text-sm">{text}</p>}
      </div>
      {(action || onRetry) && (
        <div className="flex gap-2">
          {action}
          {onRetry && <Button onClick={onRetry}>Try again</Button>}
        </div>
      )}
    </div>
  );
}

export function Unreachable({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      mood="error"
      title="Paperclip is not reachable"
      text="The agents are still there. The panel keeps trying in the background."
      onRetry={onRetry}
    />
  );
}

/** Loading state: a small busy character, not a grey spinner. */
export function Loading({ label = "Fetching…", compact = false }: { label?: string; compact?: boolean }) {
  return (
    <div className={cx("fade-in flex items-center justify-center gap-3", compact ? "py-3" : "py-16")} role="status">
      <Critter agent={HELPER} size={compact ? 24 : 36} mood="busy" />
      <span className="text-xs">{label}</span>
    </div>
  );
}

export function Dots() {
  return (
    <span className="dots inline-flex gap-0.5" aria-hidden>
      <span className="size-1 rounded-full bg-muted-foreground" />
      <span className="size-1 rounded-full bg-muted-foreground" />
      <span className="size-1 rounded-full bg-muted-foreground" />
    </span>
  );
}

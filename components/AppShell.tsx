"use client";
// App shell (DESIGN.md "App-shell layout proposal"): a muted left sidebar with the navigation, and the main
// pane on the page background. Each page owns its 60px header, content and actions. The sidebar collapses
// to an icon rail (remembered per browser). Below 768px the sidebar becomes an opaque fixed bottom nav.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "@/lib/theme";
import { Badge, Icon, IconButton, cx, type IconName } from "./ui";
import type { VoiceMode } from "@/lib/voice";
import { VoiceProvider } from "./voice";

const TABS: { href: string; label: string; icon: IconName }[] = [
  { href: "/office", label: "Office", icon: "office" },
  { href: "/dashboard", label: "Dashboard", icon: "dashboard" },
  { href: "/chat", label: "Chat", icon: "chat" },
];
const COLLAPSE_KEY = "panel-sidebar-collapsed";

/** The panel's mark: a tiny critter in the primary colour. */
export function Mark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("shrink-0", className)} aria-hidden>
      <circle cx="12" cy="13" r="10" fill="var(--primary)" />
      <circle cx="8.5" cy="5" r="2.6" fill="var(--primary)" />
      <circle cx="15.5" cy="5" r="2.6" fill="var(--primary)" />
      <ellipse cx="9" cy="12" rx="2.2" ry="2.6" fill="var(--primary-foreground)" />
      <ellipse cx="15" cy="12" rx="2.2" ry="2.6" fill="var(--primary-foreground)" />
      <circle cx="9.3" cy="12.3" r="1.2" fill="var(--primary)" />
      <circle cx="15.3" cy="12.3" r="1.2" fill="var(--primary)" />
      <path d="M10 16.5q2 1.8 4 0" stroke="var(--primary-foreground)" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const [theme, toggle] = useTheme();
  const dark = theme === "dark";
  return (
    <IconButton label={dark ? "Switch to light mode" : "Switch to dark mode"} onClick={toggle} className={className}>
      <Icon name={dark ? "sun" : "moon"} />
    </IconButton>
  );
}

async function logout() {
  await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
  // full reload on purpose: drop all client state on logout
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  window.location.href = "/login";
}

export default function AppShell({ mock, voice, children }: { mock: boolean; voice: VoiceMode; children: React.ReactNode }) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    // a stored choice ("1" / "0") always wins; without one, tablets and small laptops start with the rail.
    // The automatic default is evaluated once on mount and never written to storage.
    const auto = matchMedia("(max-width: 1023px)").matches;
    let saved: string | null = null;
    try {
      saved = localStorage.getItem(COLLAPSE_KEY);
    } catch {
      // storage blocked: use the automatic default
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- per-browser preference read after mount
    setCollapsed(saved === "1" ? true : saved === "0" ? false : auto);
  }, []);

  const toggleCollapsed = () => {
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
    } catch {
      // storage blocked: still toggles for this page view
    }
  };

  return (
    <div className="flex h-screen">
      <aside
        className={cx(
          "hidden shrink-0 flex-col gap-4 border-r border-border bg-muted bg-clip-padding p-3 md:flex",
          "transition-[width] duration-(--motion-pane-width-reset) ease-(--motion-ease-standard)",
          collapsed ? "w-rail" : "w-sidebar",
        )}
        aria-label="Sidebar"
      >
        <div className={cx("flex h-btn-sm items-center gap-2", collapsed ? "justify-center" : "px-2")}>
          {!collapsed && (
            <Link href="/office" className="flex min-w-0 flex-1 items-center gap-2 rounded-md">
              <Mark className="size-5" />
              <span className="truncate text-sm font-semibold text-foreground">Agents Panel</span>
            </Link>
          )}
          <IconButton label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={toggleCollapsed}>
            <Icon name="sidebar" />
          </IconButton>
        </div>

        <nav className="flex flex-col gap-0.5" aria-label="Main">
          {!collapsed && <p className="label-caps px-2 pb-1">Workspace</p>}
          {TABS.map((t) => {
            const active = path.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? "page" : undefined}
                title={collapsed ? t.label : undefined}
                className={cx(
                  "flex h-btn-sm items-center gap-2 rounded-md px-2 text-sm transition-colors duration-(--motion-duration-fast)",
                  collapsed && "justify-center",
                  active ? "bg-muted-highlight text-foreground" : "text-foreground/80 hover:bg-muted-highlight hover:text-foreground",
                )}
              >
                <Icon name={t.icon} />
                {!collapsed && t.label}
              </Link>
            );
          })}
        </nav>

        <div className={cx("mt-auto flex gap-1", collapsed ? "flex-col items-center" : "items-center px-1")}>
          {mock && !collapsed && (
            <Badge title="PAPERCLIP_MOCK=1: example data" className="mr-auto">
              Mock data
            </Badge>
          )}
          <ThemeToggle />
          <IconButton label="Log out" onClick={logout}>
            <Icon name="logout" />
          </IconButton>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col pb-bottomnav md:pb-0">
        <div className="min-h-0 flex-1">
          <VoiceProvider mode={voice}>{children}</VoiceProvider>
        </div>
      </div>

      {/* mobile: opaque bottom navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-40 flex h-bottomnav items-stretch border-t border-border bg-background md:hidden" aria-label="Main">
        {TABS.map((t) => {
          const active = path.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={cx("flex flex-1 flex-col items-center justify-center gap-0.5 text-xs", active ? "text-foreground" : "text-muted-foreground")}
            >
              <Icon name={t.icon} />
              {t.label}
            </Link>
          );
        })}
        <div className="flex items-center gap-1 px-2">
          <ThemeToggle />
          <IconButton label="Log out" onClick={logout}>
            <Icon name="logout" />
          </IconButton>
        </div>
      </nav>
    </div>
  );
}

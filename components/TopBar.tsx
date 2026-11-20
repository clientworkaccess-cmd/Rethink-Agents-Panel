"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/lib/theme";

const TABS = [
  { href: "/office", label: "Office" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/chat", label: "Chat" },
];

export function Mark({ size = 22 }: { size?: number }) {
  // a tiny violet critter: the panel's mark
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="13" r="10" fill="var(--color-accent)" />
      <circle cx="8.5" cy="5" r="2.6" fill="var(--color-accent)" />
      <circle cx="15.5" cy="5" r="2.6" fill="var(--color-accent)" />
      <ellipse cx="9" cy="12" rx="2.2" ry="2.6" fill="#fff" />
      <ellipse cx="15" cy="12" rx="2.2" ry="2.6" fill="#fff" />
      <circle cx="9.3" cy="12.3" r="1.2" fill="#2a1f3d" />
      <circle cx="15.3" cy="12.3" r="1.2" fill="#2a1f3d" />
      <path d="M10 16.5q2 1.8 4 0" stroke="#2a1f3d" strokeWidth="1.2" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function ThemeToggle() {
  const [theme, toggle] = useTheme();
  const dark = theme === "dark";
  return (
    <button
      onClick={toggle}
      className="btn btn-ghost px-2"
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden>
        {dark ? (
          <>
            <circle cx="12" cy="12" r="4.2" />
            <path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M5.3 18.7l1.4-1.4M17.3 6.7l1.4-1.4" />
          </>
        ) : (
          <path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z" />
        )}
      </svg>
    </button>
  );
}

export default function TopBar({ mock }: { mock: boolean }) {
  const path = usePathname();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // full reload on purpose: drop all client state on logout
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-line bg-canvas px-4 sm:gap-8 sm:px-6">
      <Link href="/office" className="flex items-center gap-2">
        <Mark />
        <span className="display hidden text-[20px] sm:inline">Agents Panel</span>
      </Link>
      <nav className="flex h-full items-center gap-1" aria-label="Main">
        {TABS.map((t) => {
          const active = path.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex h-full items-center px-3 text-[12px] font-medium uppercase tracking-[0.24px] transition-colors ${
                active ? "text-ink" : "text-body hover:text-accent"
              }`}
            >
              {t.label}
              <span
                className={`absolute inset-x-3 bottom-0 h-[2px] bg-accent transition-transform duration-200 ${active ? "scale-x-100" : "scale-x-0"}`}
              />
            </Link>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        {mock && (
          <span className="eyebrow hidden rounded-full border border-line px-2 py-0.5 sm:inline" title="PAPERCLIP_MOCK=1: example data">
            Mock data
          </span>
        )}
        <ThemeToggle />
        <button onClick={logout} className="btn btn-outline">
          Log out
        </button>
      </div>
    </header>
  );
}

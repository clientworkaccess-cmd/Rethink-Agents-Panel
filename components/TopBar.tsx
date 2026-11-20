"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/office", label: "Office" },
  { href: "/dashboard", label: "Dashboard" },
  { href: "/chat", label: "Chat" },
];

export default function TopBar({ mock }: { mock: boolean }) {
  const path = usePathname();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    // full reload on purpose: drop all client state on logout
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = "/login";
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-6 border-b border-warm-mist/70 px-4 sm:px-6">
      <div className="flex items-center gap-2">
        <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
          <rect x="1" y="1" width="16" height="16" rx="5" fill="#27251e" />
          <circle cx="6.5" cy="8" r="1.4" fill="#faf8f5" />
          <circle cx="11.5" cy="8" r="1.4" fill="#faf8f5" />
          <path d="M6 11.5c1.6 1.4 4.4 1.4 6 0" stroke="#faf8f5" strokeWidth="1.3" fill="none" strokeLinecap="round" />
        </svg>
        <span className="text-body-lg font-medium">Agents Panel</span>
        {mock && (
          <span className="rounded-full border border-warm-mist px-2 py-0.5 text-caption text-graphite" title="PAPERCLIP_MOCK=1: example data">
            Mock data
          </span>
        )}
      </div>
      <nav className="flex items-center gap-1">
        {TABS.map((t) => {
          const active = path.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`rounded-full px-3 py-1.5 text-body transition-colors ${
                active ? "bg-deep-teal text-white" : "text-graphite hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          );
        })}
      </nav>
      <button
        onClick={logout}
        className="ml-auto rounded-md border border-warm-mist px-3 py-1.5 text-body text-graphite transition-colors hover:text-ink"
      >
        Log out
      </button>
    </header>
  );
}

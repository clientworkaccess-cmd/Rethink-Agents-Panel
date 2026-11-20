"use client";

import { useState } from "react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "Wrong email or password." : "Could not log in. Please try again.");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      // only same-site paths
      window.location.href = next && next.startsWith("/") && !next.startsWith("//") ? next : "/office";
    } catch {
      setError("The panel server is not reachable.");
    } finally {
      setBusy(false);
    }
  }

  const input =
    "w-full rounded-xl border border-warm-mist bg-parchment px-3 py-2.5 text-body-lg text-ink placeholder:text-graphite outline-none focus:border-deep-teal/60";

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-[360px] rounded-2xl bg-soft-paper p-8 shadow-subtle">
        <div className="mb-6 flex items-center gap-2">
          <Mark />
          <span className="text-body-lg font-medium">Agents Panel</span>
        </div>
        <p className="mb-6 text-body text-graphite">Log in to see your agent team.</p>
        <label className="mb-1 block text-body-sm text-graphite" htmlFor="email">
          Email
        </label>
        <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${input} mb-4`} />
        <label className="mb-1 block text-body-sm text-graphite" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className={input}
        />
        <p role="alert" className="mt-3 min-h-5 text-body-sm text-st-error">
          {error}
        </p>
        <button
          type="submit"
          disabled={busy}
          className="mt-2 w-full rounded-xl bg-ink px-3 py-2.5 text-body text-parchment transition-opacity disabled:opacity-60"
        >
          {busy ? "Logging in…" : "Log in"}
        </button>
      </form>
    </main>
  );
}

function Mark() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <rect x="1" y="1" width="16" height="16" rx="5" fill="#27251e" />
      <circle cx="6.5" cy="8" r="1.4" fill="#faf8f5" />
      <circle cx="11.5" cy="8" r="1.4" fill="#faf8f5" />
      <path d="M6 11.5c1.6 1.4 4.4 1.4 6 0" stroke="#faf8f5" strokeWidth="1.3" fill="none" strokeLinecap="round" />
    </svg>
  );
}

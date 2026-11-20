"use client";

import { useState } from "react";
import Critter from "@/components/character/Critter";
import { Mark, ThemeToggle } from "@/components/TopBar";

const CREW = [
  { id: "crew-a", role: "cro", name: "a" },
  { id: "crew-b", role: "cmo", name: "b" },
  { id: "crew-c7", role: "analyst", name: "c" },
  { id: "crew-d", role: "general", name: "d" },
];

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
    "w-full rounded-sm border border-line bg-canvas px-3 py-2.5 text-body text-ink placeholder:text-muted outline-none transition-colors focus:border-accent";

  return (
    <main className="dotgrid relative flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="page-enter w-full max-w-[380px]">
        <div className="mb-[-6px] flex items-end justify-center gap-1" aria-hidden>
          {CREW.map((c, i) => (
            <Critter key={c.id} agent={c} size={44} mood={i === 1 ? "wave" : "idle"} />
          ))}
        </div>
        <form onSubmit={submit} className="rounded-sm border border-line bg-canvas p-8">
          <div className="mb-2 flex items-center gap-2">
            <Mark />
            <p className="eyebrow">Your agent team</p>
          </div>
          <h1 className="display mb-6 text-[32px]">Agents Panel</h1>
          <label className="mb-1 block text-caption text-body" htmlFor="email">
            Email
          </label>
          <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={`${input} mb-4`} />
          <label className="mb-1 block text-caption text-body" htmlFor="password">
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
          <p role="alert" className="mt-3 min-h-5 text-caption text-st-error">
            {error}
          </p>
          <button type="submit" disabled={busy} className="btn btn-primary mt-2 w-full py-2.5 uppercase">
            {busy ? "Logging in…" : "Log in"}
          </button>
        </form>
      </div>
    </main>
  );
}

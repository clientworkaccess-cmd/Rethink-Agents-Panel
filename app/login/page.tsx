"use client";

import { useState } from "react";
import { Mark, ThemeToggle } from "@/components/AppShell";
import { withBase } from "@/lib/base";
import Critter from "@/components/character/Critter";
import { Button, InlineNotice, cardClass } from "@/components/ui";

const CREW = [
  { id: "crew-a", role: "cro", name: "a" },
  { id: "crew-b", role: "cmo", name: "b" },
  { id: "crew-c7", role: "analyst", name: "c" },
  { id: "crew-d", role: "general", name: "d" },
];

const INPUT =
  "h-control w-full rounded-lg border border-control-border bg-background-alt px-3 text-sm text-foreground placeholder:text-muted-foreground";

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
      const res = await fetch(withBase("/api/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        setError(res.status === 401 ? "Wrong email or password. Check both and try again." : "Could not log in. Please try again.");
        return;
      }
      const next = new URLSearchParams(window.location.search).get("next");
      // only same-site paths
      window.location.href = withBase(next && next.startsWith("/") && !next.startsWith("//") ? next : "/office");
    } catch {
      setError("The panel server is not reachable. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-muted px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="page-enter w-full max-w-login">
        <div className="-mb-1.5 flex items-end justify-center gap-1" aria-hidden>
          {CREW.map((c, i) => (
            <Critter key={c.id} agent={c} size={44} mood={i === 1 ? "wave" : "idle"} />
          ))}
        </div>
        <form onSubmit={submit} className={cardClass("default", false, "flex flex-col gap-5 p-6")}>
          <div className="flex items-center gap-3">
            <Mark />
            <div>
              <h1 className="text-xl font-semibold text-foreground">Agents Panel</h1>
              <p className="text-xs">Log in to see your agent team.</p>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-foreground" htmlFor="email">
              Email
            </label>
            <input id="email" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} className={INPUT} />
          </div>
          <div className="flex flex-col gap-2">
            <label className="text-sm text-foreground" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={INPUT}
            />
          </div>
          {error && <InlineNotice tone="error">{error}</InlineNotice>}
          <Button type="submit" variant="primary" size="control" disabled={busy} className="w-full">
            {busy ? "Logging in…" : "Log in"}
          </Button>
        </form>
      </div>
    </main>
  );
}

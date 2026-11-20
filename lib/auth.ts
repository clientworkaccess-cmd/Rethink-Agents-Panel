// Credential check for the single panel user (PANEL_EMAIL / PANEL_PASSWORD, plain text for now).
import { createHash, timingSafeEqual } from "node:crypto";

const digest = (s: string) => createHash("sha256").update(s, "utf8").digest();

/** Timing-safe: both values are hashed to equal length before comparing. */
function safeEqual(a: string, b: string): boolean {
  return timingSafeEqual(digest(a), digest(b));
}

export function checkCredentials(email: string, password: string): boolean {
  const wantEmail = process.env.PANEL_EMAIL ?? "";
  const wantPassword = process.env.PANEL_PASSWORD ?? "";
  if (!wantEmail || !wantPassword || !process.env.SESSION_SECRET) return false;
  const emailOk = safeEqual(email.trim().toLowerCase(), wantEmail.trim().toLowerCase());
  const passwordOk = safeEqual(password, wantPassword);
  return emailOk && passwordOk;
}

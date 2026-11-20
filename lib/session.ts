// Signed session cookie. Uses Web Crypto only, so it works in proxy.ts and in route handlers.
// To move to two-factor auth or Paperclip's `authenticated` mode later, replace this module.

export const SESSION_COOKIE = "panel_session";
export const SESSION_MAX_AGE = 7 * 24 * 60 * 60; // seconds

const enc = new TextEncoder();

function b64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromB64url(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function key(): Promise<CryptoKey> | null {
  const secret = process.env.SESSION_SECRET;
  if (!secret) return null;
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

export async function createSession(email: string): Promise<string> {
  const k = await key();
  if (!k) throw new Error("SESSION_SECRET is not set");
  const payload = b64url(enc.encode(JSON.stringify({ sub: email, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE })));
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", k, enc.encode(payload)));
  return `${payload}.${b64url(sig)}`;
}

/** True if the token carries a valid signature and has not expired. */
export async function verifySession(token: string | undefined): Promise<boolean> {
  if (!token) return false;
  const k = await key();
  if (!k) return false;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return false;
  try {
    // subtle.verify compares in constant time
    const ok = await crypto.subtle.verify("HMAC", k, fromB64url(sig), enc.encode(payload));
    if (!ok) return false;
    const { exp } = JSON.parse(new TextDecoder().decode(fromB64url(payload))) as { exp?: number };
    return typeof exp === "number" && exp > Date.now() / 1000;
  } catch {
    return false;
  }
}

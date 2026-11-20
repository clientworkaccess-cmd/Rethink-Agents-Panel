import { NextResponse, type NextRequest } from "next/server";
import { checkCredentials } from "@/lib/auth";
import { createSession, SESSION_COOKIE, SESSION_MAX_AGE } from "@/lib/session";

export async function POST(req: NextRequest) {
  let email = "";
  let password = "";
  try {
    const body = (await req.json()) as { email?: unknown; password?: unknown };
    email = typeof body.email === "string" ? body.email : "";
    password = typeof body.password === "string" ? body.password : "";
  } catch {
    // fall through: empty credentials are rejected below
  }
  if (!checkCredentials(email, password)) {
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing a little
    return NextResponse.json({ error: "invalid_credentials", message: "Wrong email or password." }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  const https = req.nextUrl.protocol === "https:" || req.headers.get("x-forwarded-proto") === "https";
  res.cookies.set(SESSION_COOKIE, await createSession(email.trim().toLowerCase()), {
    httpOnly: true,
    sameSite: "lax",
    secure: https,
    path: "/",
    maxAge: SESSION_MAX_AGE,
  });
  return res;
}

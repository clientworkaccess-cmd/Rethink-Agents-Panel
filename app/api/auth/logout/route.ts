import { COOKIE_PATH } from "@/lib/base";
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/session";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { httpOnly: true, sameSite: "lax", path: COOKIE_PATH, maxAge: 0 });
  return res;
}

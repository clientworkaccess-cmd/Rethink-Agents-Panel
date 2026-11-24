// Guards every page and every /api route. Pages redirect to /login; API routes get 401.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/session";

const PUBLIC = new Set(["/login", "/api/auth/login"]);

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const authed = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (PUBLIC.has(pathname)) {
    if (authed && pathname === "/login") return NextResponse.redirect(at(req, "/office"));
    return NextResponse.next();
  }
  if (authed) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "unauthorized", message: "Please log in." }, { status: 401 });
  }
  const login = at(req, "/login");
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

/** Same-origin URL for an app path, keeping the basePath (req.nextUrl.pathname excludes it). */
function at(req: NextRequest, path: string) {
  const url = req.nextUrl.clone();
  url.pathname = path;
  url.search = "";
  return url;
}

export const config = {
  // Everything except Next's static build output.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

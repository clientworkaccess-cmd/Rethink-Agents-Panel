// Sub-path the panel is served under (e.g. "/agents" behind nginx), or "" at the root.
// Set BASE_PATH before `npm run build`: next.config copies it into NEXT_PUBLIC_BASE_PATH.
// next/link, the router, redirect() and assets get it from `basePath` automatically;
// raw fetch() calls, window.location and cookie paths must use withBase().

export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

/** Prefixes a root-relative path ("/api/x") with the base path. Safe to call twice. */
export function withBase(path: string): string {
  if (!BASE_PATH || !path.startsWith("/") || path.startsWith("//")) return path;
  if (path === BASE_PATH || path.startsWith(`${BASE_PATH}/`) || path.startsWith(`${BASE_PATH}?`)) return path;
  return `${BASE_PATH}${path}`;
}

/** Removes the base path from a browser pathname, giving the app-relative path. */
export function stripBase(path: string): string {
  if (!BASE_PATH) return path;
  if (path === BASE_PATH) return "/";
  return path.startsWith(`${BASE_PATH}/`) ? path.slice(BASE_PATH.length) : path;
}

/** Cookie path for the session: the base path, or "/" at the root. */
export const COOKIE_PATH = BASE_PATH || "/";

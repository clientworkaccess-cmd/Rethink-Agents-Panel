# Next — current status

_Last updated: 2026-11-20_

## Status
- Panel V1 and V2 merged into `main`.
- **Design refresh** on `feat/design-refresh`: UI-only restyle to the new `DESIGN.md` (token layer in `app/globals.css`, shared primitives in `components/ui.tsx` + `components/lists.tsx`, app shell with left sidebar / mobile bottom nav, all screens restyled, Pixi bubble/label chrome reads the tokens via `lib/tokens.ts`). Characters, scenes, data and API logic unchanged. PR open into `main`, not merged.
- Verified in mock mode only (build, tsc, ESLint clean; screens checked in light and dark; auth guards still 307/401). **Chat sessions against the real Paperclip are still not verified** (carried over from V2).

## Next
1. Strategist and Alyan review the design-refresh PR visually (mock mode, light and dark). Open questions are listed in the PR: proposed dark muted/foreground values, Paper Mono substitute, sidebar default (open vs rail), task-row status icons.
2. Merge after Alyan's OK.
3. Still open from V2: Alyan runs the session check calls on the VPS; fix differences in the chat-session block of `lib/paperclip.ts`; check `heartbeat-runs`, `/activity`, `/costs/summary` field names against `lib/normalize.ts`.
4. Deploy on the VPS (service + reverse proxy with TLS; port 3100 stays closed).

## Resume point for UI work
- New visual values go into `app/globals.css` only, then use the generated utility (`bg-…`, `text-…`, `h-…`). Palette classes are disabled on purpose.
- Not built (would be new features, not restyle): sortable/reorderable task columns, cell marquee, task hover cards on links, scroll-aware bottom nav, sidebar resize handle.

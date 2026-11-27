# Brief 04: Team tab, the org chart

**Repo:** https://github.com/clientworkaccess-cmd/Rethink-Agents-Panel
**Branch:** `feat/org-chart` → PR into `main`. Do not merge it yourself.
**Builds on:** current `main` (Office, Dashboard, Chat, character system). Reuse everything; this brief adds one tab.

---

## 1. Why
More agents are now live in Paperclip (CRO, Communication Manager, Analytics Manager, and more coming). The Office shows *who exists* but not *who manages whom*. The owners need to see the chain of command at a glance: who reports to the CRO, who the CRO delegates to, and who is working right now.

**Bar for done:** someone who has never seen the panel opens the Team tab and can say in five seconds who is at the top, who reports to whom, and who is busy.

## 2. Data: Paperclip already has it (verified against the Paperclip source, 2026-11-27)
| What | Where | Notes |
|---|---|---|
| Reporting line | `reportsTo` on every agent (`string \| null`, the manager's agent id) | DB column `agents.reports_to`. Paperclip prevents cycles and cross-company links. `null` = top of the tree. |
| Ready-made tree | `GET /api/companies/{cid}/org` | Nodes: `{ id, name, role, status, reports: Node[] }`, recursive. Excludes terminated agents. Most likely an **array of root nodes** (not 100% verified). |
| Chain of command for one agent | `GET /api/agents/{id}` → `chainOfCommand` | Not needed for V1 of this tab. |
| Display title | `title` on the agent (nullable) | Show under the name when present. |

**Approach:**
1. **Primary:** the backend calls `GET /companies/{cid}/org` and returns the tree.
2. **Fallback** (if `/org` 404s or returns an unexpected shape): build the tree on the backend from `GET /companies/{cid}/agents` using `reportsTo`. Treat agents whose `reportsTo` is null or points to an unknown/terminated agent as roots. Guard against cycles anyway (visited set).
3. **Status / activity:** don't use the org node's `status` alone. Merge with the existing `/api/agents` payload (agents + live runs) on the client and use `activityOf()` from `lib/agents.ts`, so a node shows the same "working / idle / paused / error" as the Office.

**First step, before coding the UI:** on the VPS, run
`curl -s http://127.0.0.1:3100/api/companies/<cid>/org | head -c 2000` and
`curl -s http://127.0.0.1:3100/api/companies/<cid>/agents | head -c 2000`
and paste both shapes into the PR description. Confirm (a) the `/org` root is an array or object, and (b) `reportsTo` appears on list items. Adjust the normaliser to match.

## 3. Backend
- New route `app/api/org/route.ts` → `GET /api/org`. Same login guard and mock mode as the other routes.
- In `lib/paperclip.ts`: `getOrg()` with the primary + fallback logic above.
- In `lib/normalize.ts`: `toOrgNode()`; also add `reportsTo: string | null` and `title: string | null` to `toAgent()` / the `Agent` type (read `reportsTo`, `reports_to`).
- New type in `lib/types.ts`: `OrgNode = { id, name, role, title, status, reports: OrgNode[] }`.
- `lib/mock.ts`: a mock tree with 3 levels and ~8 agents (CRO → Communication Manager, Analytics Manager, Geo Intelligence; Communication Manager → 2 agents; one orphan root) so the layout can be built without the VPS.
- Read-only: no Paperclip writes. Poll every 30 s (structure changes rarely); status comes from the existing 3–5 s agents poll.

## 4. Frontend: the Team tab
**Nav:** add `{ href: "/team", label: "Team", icon: … }` to `TABS` in `components/AppShell.tsx`, between Office and Dashboard. Page at `app/(panel)/team/page.tsx`, component in `components/team/OrgChart.tsx`.

**Layout (desktop / tablet):** classic top-down org chart.
- Root(s) at the top, each level below, children centred under their manager.
- **Connectors:** soft elbow lines (manager → vertical down → horizontal bus → vertical down to each child), drawn in one SVG layer behind the cards, colour from tokens (`border` / muted). Lines from a manager to a **working** child gently animate (dashed flow or pulse) to show delegation in progress; respect `prefers-reduced-motion`.
- Layout maths: use `d3-hierarchy` (`tree()` with `nodeSize`) — small, no DOM ownership — or an equivalent hand-rolled tidy tree. No heavy graph library (no React Flow / Cytoscape).
- Multiple roots sit side by side; orphans are labelled "No manager set".

**Node card:** reuse the character, not a new avatar.
- `Critter` (`components/character/Critter.tsx`) at ~56 px, mood from activity (`busy` when working, `sleep` when paused, `error` on error, `idle` otherwise). Same look as in the Office.
- Name (600), `title` or `roleLabel()` (muted), small status dot + label from `ACTIVITY_LABEL` / `ACTIVITY_COLOR`.
- Badge with direct-report count on managers; chevron to collapse/expand a subtree (collapsed state kept in `localStorage`).
- If the agent has a live run, show a one-line `bubbleText()` of its issue title under the card.
- Tokens and `components/ui.tsx` primitives only (Card, Badge, Status*). No hex, no raw px, light + dark.

**Interaction:**
- Hover a node → highlight its chain up to the root and its reports down (dim the rest).
- Click a node → side panel (reuse the existing drawer/TaskPanel pattern): name, role, manager, direct reports (clickable), current task, and a "Chat" button linking to `/chat` with that agent selected.
- Pan (drag) and zoom (wheel / pinch, plus +/−/fit buttons) when the tree is wider than the viewport. "Fit" on first load.
- Empty state (`EmptyState`) when there are no agents; inline notice if `/org` failed and the fallback was used (dev only, not shown to owners).

**Mobile (< 768 px):** don't squeeze the chart. Show an indented tree list (same node content, smaller Critter, guide lines on the left, collapsible), no pan/zoom. No horizontal page scroll.

**Motion:** nodes fade/scale in level by level on first load; new agents appear with the same entrance. Short, using the motion tokens in `globals.css`.

## 5. Out of scope
- Editing the hierarchy (drag to re-parent, changing `reportsTo`). The panel stays read-only toward Paperclip.
- Paperclip's `/org.svg` / `/org.png` images (they don't use our characters).
- Cross-agent task flow graphs (which issue was delegated to whom). Possible follow-up.

## 6. Acceptance criteria
1. `GET /api/org` returns the tree from real Paperclip on the VPS; the PR shows the raw `/org` and `/agents` shapes.
2. With `/org` forced to fail, the tree is still built correctly from `reportsTo`.
3. Every real agent appears exactly once, under its real manager; terminated agents don't appear.
4. Node status matches the Office for the same agent at the same moment.
5. Characters are identical to the Office/Chat ones (same `Critter`, same colours).
6. Works in light and dark, at 375 px (list) and ≥ 1024 px (chart); no horizontal page scroll.
7. Lint and build pass; screenshots (desktop light, desktop dark, mobile) in `docs/screenshots/` and the PR.
8. `CHANGELOG.md` and `NEXT.md` updated; README lists the new route.

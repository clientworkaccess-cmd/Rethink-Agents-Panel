# Rethink Agents Panel

> `CLAUDE.md` and `AGENTS.md` must stay identical. When you edit one, mirror the change to the other in the same edit.

## What we're building
A simple, interactive web panel for the AI agent organization of Rethink Self Storage (Gamma Income). It replaces Paperclip's own dashboard, which is too complex for the business owners.

The panel has three parts:
1. **Office:** a 2D cartoon office. Every agent is a character. Idle agents sit at their desks. Working agents move around and act out their role: the CRO studies charts, the CMO works on campaigns, and so on. New agents appear automatically.
2. **Dashboard:** agents, their status and their tasks, read from Paperclip.
3. **Chat:** talk to any agent. Artifacts the agent creates (Markdown documents, HTML, files) open in a side drawer inside the chat, like Claude's artifacts.

It must feel minimal and interactive, not like a grid of cards.

## How it fits together
```
browser ──> panel (frontend + its own backend, on the VPS) ──> Paperclip API  http://127.0.0.1:3100/api
```
- **Paperclip** runs on the same VPS on loopback, in `local_trusted` mode, so it needs **no API token**. Requests from the VPS are trusted as admin.
- **All Paperclip calls go through the panel's backend.** The browser never calls Paperclip directly (Paperclip has no CORS, and port 3100 must never be exposed).
- **Data:** Paperclip's REST JSON API with polling (agents and live runs every 3–5 s; chat comments every 2–3 s while a reply is pending). No WebSocket in V1.
- **Login:** one email and password from `.env` (`PANEL_EMAIL`, `PANEL_PASSWORD`), checked by the backend, then a session cookie. Every page and API route requires login. Two-factor or Paperclip `authenticated` mode come later.

## Paperclip API reference (verified 2026-11-20)
| Need | Endpoint |
|---|---|
| Agents and status | `GET /api/companies/{cid}/agents` |
| What's running now | `GET /api/companies/{cid}/live-runs` |
| Tasks | `GET /api/companies/{cid}/issues` |
| Open a chat with an agent | `POST /api/companies/{cid}/chats/{agentId}` (returns the chat issue) |
| List my chats | `GET /api/companies/{cid}/chats` |
| Send a message | `POST /api/issues/{issueId}/comments` with `{ body, clientRequestId }` |
| Read replies | `GET /api/issues/{issueId}/comments?after={lastId}&order=asc` |
| Run progress | `GET /api/issues/{issueId}/live-runs`, `GET /api/heartbeat-runs/{runId}/events?afterSeq=N` |
| Artifacts (all) | `GET /api/companies/{cid}/artifacts?agentId=…` |
| Documents in a chat | `GET /api/issues/{issueId}/documents/{key}` |
| Files in a chat | `GET /api/issues/{issueId}/attachments`, `GET /api/attachments/{id}/content[?download=1]` |
| Chat sessions (panel, brief 02; **real-Paperclip check pending**) | `POST /api/companies/{cid}/issues` (assigned to the agent, marker `panel-chat-session: v1` in the description), then the comment, then optional `POST /api/agents/{id}/wakeup`. List: `GET /api/companies/{cid}/issues?assigneeAgentId=…` filtered by the marker. All in `lib/paperclip.ts`; falls back to `/chats` if it fails |

Agent `status`: `active, paused, idle, running, error, pending_approval, terminated`. There is no "waiting" status; derive it.
Replies come as whole comments, not streamed; show run progress as a "working…" indicator.
HTML attachments are served as downloads; preview them in a sandboxed `<iframe srcdoc>` (no `allow-same-origin`).
Full research: `docs/paperclip-api-research.md` and the Paperclip OpenAPI at `GET /api/openapi.json`.

## Design
Follow `DESIGN.md` (Paperclip's design principles, adopted 2026-11-20, adapted to this panel). The single token source is `app/globals.css` (Tailwind v4): semantic colour tokens in `:root` / `[data-theme="dark"]`, motion tokens in `:root`, type ramp/radii/geometry in `@theme`. Components use token utilities only: no hex, raw px or arbitrary Tailwind values; no palette classes (they are disabled). Shared primitives live in `components/ui.tsx` (Button, IconButton, Card, Badge, Status*, Segmented, Select, PageHeader, InlineNotice, EmptyState) and `components/lists.tsx` (TaskRow, ActivityList); reuse them, add variants as props. Pixi scenes read bubble/label/status colours from the same tokens via `lib/tokens.ts`. Neutral palette, Inter + JetBrains Mono, 400/600 weights only, light + dark. Characters (brief 03) are chibi people: big head, small body, clean dark outlines, soft shading. Each agent's look (skin, hair, outfit, accessory) comes from its id and its role (outfit formality, prop, floating emblem; the CRO carries a briefcase and a revenue coin), and is drawn once in `components/character/art.ts`, which both the Pixi rig and the SVG avatar (`Critter.tsx`) render, so every surface shows the same character. The Office is a front-facing room (`components/office/world.ts` layout + walking grid, `room.ts` art) that grows with the team: one tagged cubicle per agent, shared areas (chart wall, whiteboard, notice board, meeting table with screen, server racks); dark theme = night. Character art, animation and the scenes are not part of the token system (only their bubbles, labels and status colours read tokens).

## Rules
1. **Read-only toward the business.** The panel only displays data, sends chat messages and creates chat-session issues (assigned to an agent, with the panel-chat marker). It never changes agents, tasks, budgets or settings in Paperclip.
2. **No secrets in code or git.** `.env` is git-ignored. Use `.env.example` for names only.
3. **Keep it simple.** No feature beyond the current brief. Propose extras, don't build them.
4. **Log every change.** Add one line at the top of `CHANGELOG.md`: `YYYY-MM-DD — short description`.
5. **Keep `NEXT.md` current** with status and where to resume.

## Workflow
- **Claude Strategist** writes the briefs and reviews pull requests.
- **Alyan** reviews each brief and hands it to the Builder.
- **Claude Builder** works on a feature branch (`feat/<name>`), opens a PR into `main`, and does not merge it.
- The Strategist reviews and merges after Alyan's OK.

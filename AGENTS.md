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

Agent `status`: `active, paused, idle, running, error, pending_approval, terminated`. There is no "waiting" status; derive it.
Replies come as whole comments, not streamed; show run progress as a "working…" indicator.
HTML attachments are served as downloads; preview them in a sandboxed `<iframe srcdoc>` (no `allow-same-origin`).
Full research: `docs/paperclip-api-research.md` and the Paperclip OpenAPI at `GET /api/openapi.json`.

## Design
Follow `DESIGN.md` everywhere (updated 2026-11-21): white paper canvas, one vivid violet accent, Lustria + DM Sans + Martian Mono, square 4px corners, hairline borders. Characters are chubby, candy-coloured claymation creatures; the office art and agents follow that style. A dark theme is derived from it (brief 02).

## Rules
1. **Read-only toward the business.** The panel only displays data and sends chat messages. It never changes agents, budgets or settings in Paperclip.
2. **No secrets in code or git.** `.env` is git-ignored. Use `.env.example` for names only.
3. **Keep it simple.** No feature beyond the current brief. Propose extras, don't build them.
4. **Log every change.** Add one line at the top of `CHANGELOG.md`: `YYYY-MM-DD — short description`.
5. **Keep `NEXT.md` current** with status and where to resume.

## Workflow
- **Claude Strategist** writes the briefs and reviews pull requests.
- **Alyan** reviews each brief and hands it to the Builder.
- **Claude Builder** works on a feature branch (`feat/<name>`), opens a PR into `main`, and does not merge it.
- The Strategist reviews and merges after Alyan's OK.

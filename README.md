# Rethink Agents Panel

A small web panel on top of the Paperclip API for the agent team. Three tabs after login:

- **Office:** a calm 2D office. Each agent is a character at a desk; working agents walk to role spots (the CRO studies the chart wall and the whiteboard, then writes at its desk).
- **Dashboard:** agents with their status, tasks (filter by agent and status, read-only side panel) and recent artifacts.
- **Chat:** talk to any agent. Documents and files it creates open in a side drawer (Markdown rendered, HTML in a sandboxed iframe, images/PDF previewed, everything downloadable).

The browser only talks to the panel. The panel's server calls Paperclip on `127.0.0.1:3100` (see `lib/paperclip.ts`); it only reads, opens chats and posts chat messages.

## Setup

Requires Node 24+ (built and tested on Node 25).

```bash
npm install
cp .env.example .env   # then fill in the values below
```

| Variable | What it is |
|---|---|
| `PAPERCLIP_API_URL` | Paperclip API base, default `http://127.0.0.1:3100/api` |
| `PAPERCLIP_COMPANY_ID` | The Paperclip company to show |
| `PANEL_EMAIL`, `PANEL_PASSWORD` | The single login (compared server-side) |
| `SESSION_SECRET` | Long random string that signs the session cookie, e.g. `openssl rand -hex 32` |
| `PAPERCLIP_MOCK` | `1` = built-in example data instead of Paperclip, `0` = real Paperclip |
| `HOST`, `PORT` | Where the panel listens, default `127.0.0.1:3400` |

Never commit `.env`.

## Run

```bash
npm run dev                  # development, http://127.0.0.1:3400
npm run build && npm start   # production
```

Both scripts read `HOST`/`PORT` from `.env` (via `scripts/run.mjs`).

## Mock mode

With `PAPERCLIP_MOCK=1` the panel needs no Paperclip at all: three agents (including a CRO), a few tasks, and a CRO chat with a Markdown document, an HTML page and a CSV. Messages get a fake reply after about 3 seconds, and the agents' statuses change on a loop so the Office shows walking and working. All figures in the mock data are examples, not real numbers.

## Layout

```
app/               pages (login, office, dashboard, chat) and the /api routes
proxy.ts           login guard for every page and /api route
lib/paperclip.ts   the only module that calls Paperclip
lib/normalize.ts   defensive mapping of Paperclip JSON
lib/mock.ts        mock-mode fixtures
components/office  PixiJS scene (lazy-loaded); role spots in roles.ts
```

To add a role to the Office, add an entry to `components/office/roles.ts`.

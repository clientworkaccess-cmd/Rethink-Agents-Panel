# Rethink Agents Panel

A small, friendly web panel on top of the Paperclip API for the agent team. After login:

- **Office:** a cosy live office. Every agent is a chubby claymation-style character that breathes, blinks and fidgets at its desk, walks to its role spot when a run starts (the CRO points at the chart wall, writes on the whiteboard, then types), thinks, celebrates when the run ends and walks back. Drag to pan, scroll or pinch to zoom, click a character to chat or see its tasks. Activity ticker, real-time wall clock, day/night window, optional sounds.
- **Chat:** a lounge where every agent idles; click one to start a new chat or continue the last one. The chat view has a sessions sidebar (several conversations per agent), Markdown replies, a live "working…" line and a Claude-like artifact drawer.
- **Dashboard:** key numbers, the team strip, a 14-day activity chart, per-agent cards, a live feed, tasks and recent artifacts. Missing data says "Not available"; nothing is invented.

Light and dark themes (dark follows the system by default; the top-bar toggle is remembered). `prefers-reduced-motion` keeps characters still except for blinking and turns off transitions.

The browser only talks to the panel. The panel's server calls Paperclip on `127.0.0.1:3100` (only in `lib/paperclip.ts`). It reads, posts chat messages and creates chat-session issues; nothing else writes.

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
| `BASE_PATH` | Sub-path the panel is served under, e.g. `/agents` behind nginx (`https://<domain>/agents`). Empty = root. **Read at build time**: set it before `npm run build`. On Windows Git Bash prefix with `MSYS_NO_PATHCONV=1` |
| `PAPERCLIP_MOCK` | `1` = built-in example data instead of Paperclip, `0` = real Paperclip |
| `HOST`, `PORT` | Where the panel listens, default `127.0.0.1:3400` |
| `PANEL_CHAT_WAKEUP` | Optional. `create` (default): wake the agent once when a chat session is created. `every`: also after each message. `off`: never |
| `PANEL_SESSION_REPLY_TIMEOUT_MS` | Optional. How long a new session waits for a first reply (with no live run) before the chat falls back to the agent's single `/chats` conversation. Default 180000 |
| `PAPERCLIP_MOCK_SESSIONS_FAIL` | Mock only. `1`/`create`: creating a session fails. `noreply`: sessions never get a reply. Both exercise the fallback |

Never commit `.env`.

## Run

```bash
npm run dev                  # development, http://127.0.0.1:3400
npm run build && npm start   # production
```

Both scripts read `HOST`/`PORT` from `.env` (via `scripts/run.mjs`).

### Mock mode (no Paperclip needed)

Set `PAPERCLIP_MOCK=1`. Four agents (CRO, Pricing Analyst, Ops Assistant, Marketing Lead) follow a 90-second loop, so within a couple of minutes you can watch walking, working, thinking (a run with no output for 10 s+), done, waiting, paused and error. The CRO has three chats (the original `/chats` conversation plus two sessions), each with its own documents and files. New messages get a fake reply after about 6 seconds. The dashboard has 14 days of example run history, example token usage (cost 0, as on a subscription) and an activity log. All figures are examples, not real numbers.

To test the session fallback: `PAPERCLIP_MOCK_SESSIONS_FAIL=create` (instant fallback), or `PAPERCLIP_MOCK_SESSIONS_FAIL=noreply PANEL_SESSION_REPLY_TIMEOUT_MS=15000` (fallback after 15 s without a reply).

### Real Paperclip

Set `PAPERCLIP_MOCK=0`, `PAPERCLIP_COMPANY_ID` and the login values, and run on the same VPS as Paperclip. Chat sessions need one check on the real instance first (see the V2 PR: the exact calls are listed there). Until then, if session creation fails or a new session gets no reply in time, the chat keeps working on the agent's single `/chats` conversation and the sidebar says so.

## Layout

```
app/                    pages (login, office, dashboard, chat) and the /api routes
proxy.ts                login guard for every page and /api route
lib/paperclip.ts        the only module that calls Paperclip (chat-session calls are in one block)
lib/normalize.ts        defensive mapping of Paperclip JSON
lib/metrics.ts          dashboard numbers (null = "Not available")
lib/mock.ts             mock-mode fixtures
components/character/   the character: model.ts (colour, variant, prop), rig.ts (Pixi layered parts),
                        brain.ts (state machine + poses), Critter.tsx (SVG version for small avatars),
                        CrewScene.tsx (row of characters: lobby, team strip, chat avatar)
components/office/      Office scene: world.ts (layout + A* walking), room.ts (art + ambient), roles.ts
components/chat/        lobby, chat view with sessions, conversation
components/dashboard/   dashboard, plain-SVG charts, task panel
```

- To add a role's work route in the Office, add an entry to `components/office/roles.ts`.
- To add a character state, add it to `State` in `components/character/brain.ts`, give it a pose in `POSES` and route to it in `decide()`.

## Art, fonts and licences

- **Characters, office, lounge, icons:** original vector art drawn in code for this project (Pixi Graphics and inline SVG). No third-party art assets are used; no Kenney or other packs were needed.
- **Sounds:** synthesised at runtime with the Web Audio API (`lib/sound.ts`); no audio files.
- **Fonts:** self-hosted from npm via Fontsource, all under the SIL Open Font License 1.1: Inter (`@fontsource-variable/inter`) and JetBrains Mono (`@fontsource-variable/jetbrains-mono`). No requests to Google Fonts at runtime.

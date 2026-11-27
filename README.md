# Rethink Agents Panel

A small, friendly web panel on top of the Paperclip API for the agent team. After login:

- **Office:** a cosy live office. Every agent is a chubby claymation-style character that breathes, blinks and fidgets at its desk, walks to its role spot when a run starts (the CRO points at the chart wall, writes on the whiteboard, then types), thinks, celebrates when the run ends and walks back. Drag to pan, scroll or pinch to zoom, click a character to chat or see its tasks. Activity ticker, real-time wall clock, day/night window, optional sounds.
- **Chat:** a lounge where every agent idles; click one to start a new chat or continue the last one. The chat view has a sessions sidebar (several conversations per agent), Markdown replies, a live "working…" line and a Claude-like artifact drawer.
- **Voice:** a mic button in the chat composer dictates into the draft (you edit and send it yourself), a speaker button reads any agent reply aloud, "Read new replies aloud" reads new replies as they arrive, and **Voice mode** (headset button) is a hands-free conversation with the agent. See [Voice](#voice).
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
| `VOICE_URL` | Optional. The voice service (speech-to-text and text-to-speech), e.g. `http://127.0.0.1:8090` on the VPS. Empty = no voice controls at all (except in mock mode, below). `mock` = mock voice |
| `PAPERCLIP_MOCK_ORG_FAIL` | Mock only. `1`: Paperclip's `/org` returns 404, so the Team tab builds the tree from each agent's `reportsTo` |
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

Voice in mock mode: with `PAPERCLIP_MOCK=1` and `VOICE_URL` empty (or `VOICE_URL=mock`), dictation returns a canned transcript after about 1 s (three on a loop) and read-aloud uses the browser's own `speechSynthesis`, so the whole Voice mode cycle can be demoed without the voice service.

### Real Paperclip

Set `PAPERCLIP_MOCK=0`, `PAPERCLIP_COMPANY_ID` and the login values, and run on the same VPS as Paperclip. Chat sessions need one check on the real instance first (see the V2 PR: the exact calls are listed there). Until then, if session creation fails or a new session gets no reply in time, the chat keeps working on the agent's single `/chats` conversation and the sidebar says so.

## Voice

The voice service runs on the VPS next to the panel, reachable only at `127.0.0.1:8090` (source and deploy notes in `services/voice/`: Parakeet TDT 0.6B for speech-to-text with an editable custom-word list, Piper for text-to-speech). The browser never calls it: the panel's routes `POST /api/voice/stt` (multipart `file`, 10 MB max, 60 s timeout) and `POST /api/voice/tts` (`{text, voice}`, voice "female" (default) or "male", picked with the Voice button in the chat header, 6000 characters max; Markdown is stripped first: code blocks dropped, tables read as "Table omitted", links read as their text) sit behind the login like every other route and only ever call `VOICE_URL` + `/stt` or `/tts`.

**The microphone needs a secure context.** Browsers only allow it on HTTPS or on `127.0.0.1`/`localhost`. Opening the panel at `http://127.0.0.1:3400` through the SSH tunnel is fine; a public deploy needs HTTPS (the reverse proxy with TLS in NEXT.md). On plain HTTP the mic button explains this instead of recording.

**Voice mode** (headset button in the chat header) opens a full-screen overlay over the current chat. It is half-duplex: it listens, sends what you said as a normal chat message (1.5 s "Cancel" chip first), says a short acknowledgement at once ("Okay, checking Catawba's leads for last week."), narrates progress from the run events ("Pulling the numbers…", at most one line every 8 s), then reads the reply aloud paragraph by paragraph and listens again. It never listens while it speaks; Interrupt (or tapping the character) stops the speech. It ends on End, Esc, the tab being hidden, 2 minutes without speech, or when the whole utterance is "stop listening" or "end voice mode" (never sent). Every turn stays in the chat as ordinary messages.

Speech detection: **Silero VAD v5** in the browser (`@ricky0123/vad-web` on onnxruntime-web), loaded only when Voice mode opens. Its model, audio worklet and wasm are served from `/vad/`, copied there from `node_modules` by `scripts/copy-vad-assets.mjs` (runs after `npm install`/`npm ci` and before `npm run build`; `public/vad/` is git-ignored). If it cannot load, an energy detector takes over. Thresholds live in `LISTEN` in `lib/voice-client.ts`:

| | Silero (default) | Energy fallback |
|---|---|---|
| speech starts | frame speech probability >= 0.5 | RMS above max(noise floor x 3, floor + 0.01, 0.012); floor = mean RMS over the first 500 ms |
| speech ends | probability < 0.35 for 1.0 s | below threshold for 1.2 s |
| too short, ignored | under 0.4 s of speech | under 0.4 s of speech |
| cut off at | 60 s | 60 s |

The acknowledgement rules, the progress phrase whitelist and the narration rates are in `lib/voice-narration.ts`. The pace of a conversation is set by the agent: a CRO run takes about 10 s or more per reply.

## Layout

```
app/                    pages (login, office, team, dashboard, chat) and the /api routes (/api/org = who reports to whom)
proxy.ts                login guard for every page and /api route
lib/paperclip.ts        the only module that calls Paperclip (chat-session calls are in one block)
lib/normalize.ts        defensive mapping of Paperclip JSON
lib/metrics.ts          dashboard numbers (null = "Not available")
lib/mock.ts             mock-mode fixtures
components/character/   the character: model.ts (colour, variant, prop), rig.ts (Pixi layered parts),
                        brain.ts (state machine + poses), Critter.tsx (SVG version for small avatars),
                        CrewScene.tsx (row of characters: lobby, team strip, chat avatar)
components/office/      Office scene: world.ts (layout + A* walking), room.ts (art + ambient), roles.ts
components/chat/        lobby, chat view with sessions, conversation, TalkMode.tsx (Voice mode)
components/voice.tsx    voice UI: dictation, read-aloud buttons, "Read new replies aloud"
lib/voice-client.ts     browser voice primitives: record, listen (VAD), transcribe, speak, stop
lib/voice.ts            server side of voice (VOICE_URL, the two service calls); lib/speech-text.ts strips Markdown
services/voice/         the voice service (FastAPI, Parakeet via sherpa-onnx, Piper) as deployed on the VPS
components/dashboard/   dashboard, plain-SVG charts, task panel
components/team/        Team tab: org chart (layout.ts tidy tree, OrgChart.tsx pan/zoom chart + phone list, AgentPanel.tsx)
```

- To add a role's work route in the Office, add an entry to `components/office/roles.ts`.
- To add a character state, add it to `State` in `components/character/brain.ts`, give it a pose in `POSES` and route to it in `decide()`.

## Art, fonts and licences

- **Characters, office, lounge, icons:** original vector art drawn in code for this project (Pixi Graphics and inline SVG). No third-party art assets are used; no Kenney or other packs were needed.
- **Voice activity detection:** Silero VAD (MIT) via `@ricky0123/vad-web` (ISC) and `onnxruntime-web` (MIT), served from the panel.
- **Sounds:** synthesised at runtime with the Web Audio API (`lib/sound.ts`); no audio files.
- **Fonts:** self-hosted from npm via Fontsource, all under the SIL Open Font License 1.1: Inter (`@fontsource-variable/inter`) and JetBrains Mono (`@fontsource-variable/jetbrains-mono`). No requests to Google Fonts at runtime.

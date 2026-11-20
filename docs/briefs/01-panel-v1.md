# Brief 01: Rethink Agents Panel V1

**Repo:** https://github.com/clientworkaccess-cmd/Rethink-Agents-Panel
**Branch:** `feat/panel-v1` → open a PR into `main`. Do not merge it yourself.
**Read first:** `CLAUDE.md`, `DESIGN.md`, `docs/paperclip-api-research.md`.

---

## 1. Context
Rethink Self Storage (Gamma Income) runs an AI agent organization in **Paperclip**, on a VPS. The first agent is the **CRO** (Chief Revenue Officer). More will follow (subagents, possibly a CMO). Paperclip's own dashboard is too complex for the business owners, so we are building a simple, friendly panel on top of Paperclip's API.

The panel has 4 parts: **Login**, **Office** (2D animated agents), **Dashboard** (agents and tasks), and **Chat** (talk to an agent, with artifacts in a side drawer, like Claude).

## 2. Environment and Paperclip access
- The panel runs on the **same VPS** as Paperclip.
- Paperclip listens on `http://127.0.0.1:3100/api` in **`local_trusted` mode**: requests from the same machine are trusted as admin, so **no API token is needed**. Just call the API.
- **Paperclip has no CORS and port 3100 is never exposed.** So the browser must **never** call Paperclip. Every call goes through the panel's own server-side routes.
- Use the **REST JSON API with polling**. No WebSocket in V1.
- Company ID comes from `PAPERCLIP_COMPANY_ID`. The chat with the CRO has been tested on the VPS and works.

## 3. Tech stack
| Part | Choice |
|---|---|
| Framework | **Next.js (App Router) + TypeScript**: one app for both the UI and the server-side proxy routes |
| Styling | **Tailwind CSS**, with the `DESIGN.md` tokens as CSS variables / Tailwind theme |
| 2D office | **PixiJS v8 + `@pixi/react`**, installed from npm and **lazy-loaded only on the Office tab** (dynamic `import()`, `ssr: false`) |
| Markdown | `react-markdown` + `remark-gfm` (tables) |
| Data fetching | Plain `fetch` with a small polling hook (or SWR with `refreshInterval`) |
| Runtime | Node 24 (already on the VPS). Port from `PORT` (default 3400), host `127.0.0.1` |

No database. No other heavy libraries without asking.

## 4. Configuration (`.env`, already listed in `.env.example`)
```
PAPERCLIP_API_URL=http://127.0.0.1:3100/api
PAPERCLIP_COMPANY_ID=
PANEL_EMAIL=
PANEL_PASSWORD=
SESSION_SECRET=
HOST=127.0.0.1
PORT=3400
PAPERCLIP_MOCK=0
```
Add `PAPERCLIP_MOCK` to `.env.example` (see section 10).

## 5. Section: Login
- A single login page, in the `DESIGN.md` style: email, password, one button.
- Credentials are compared **server-side** with `PANEL_EMAIL` and `PANEL_PASSWORD` from `.env` (plain text for now; a decision by Alyan, to be hardened later).
- On success: set a signed, `httpOnly`, `sameSite=lax` session cookie (signed with `SESSION_SECRET`), valid for 7 days.
- **Every page and every `/api/*` route of the panel requires a valid session** (Next.js middleware). Without one: pages redirect to `/login`, API routes return 401.
- A logout button in the header.
- Keep the code easy to replace later with two-factor auth or Paperclip's `authenticated` mode.

## 6. Section: App shell
- A light, minimal layout: a slim top bar with the panel name, 3 tabs (**Office**, **Dashboard**, **Chat**) and logout.
- Follow `DESIGN.md`: parchment background, ink text, one teal accent for the active tab, 16 px card radius, hairline borders, almost no shadows.
- **Not a grid of cards.** Calm, spacious, content first.
- Works on desktop first; must not break on a laptop screen (1280 px). Mobile is nice-to-have.

## 7. Section: Office (2D)
An isometric (or clean top-down) **2D cartoon office** that shows what the agents are doing right now.

**Scene**
- One room in the `DESIGN.md` palette: warm floor, desks, a meeting table, a whiteboard or chart wall, plants. Calm and simple, not busy.
- One desk per agent. New agents get a new desk automatically (lay the desks out in a grid that grows).

**Agents**
- Each agent is a small, friendly cartoon character with its name label and a status dot.
- Draw the characters and furniture **yourself** with PixiJS Graphics or simple SVG sprites created in the repo. **No copyrighted assets.**
- Each agent has a colour taken from its ID, so it stays the same across reloads.

**Behaviour, driven by real status**
| Paperclip state | What the character does |
|---|---|
| Idle (`idle`/`active` and no live run) | Sits at its desk, small breathing or blinking animation |
| Working (`running`, or has a live run) | Gets up and moves between work spots that fit its role, then works there with a small activity animation |
| Paused / pending approval | Sits with a "pause" or "?" bubble |
| Error | A red "!" bubble over the desk |
| Terminated | Not shown |

**Role-based work spots.** Map by the agent's role or name, with a default for unknown roles:
- **CRO:** walks to the chart wall and whiteboard, looks at numbers, then back to its desk to write.
- **CMO (later):** walks to a campaign/poster board.
- **Default:** walks to its desk computer and types.

Keep the mapping in one small config file so new roles are easy to add.

**Interaction**
- Hover a character: a tooltip with name, role, status and current task title (from the live run).
- Click a character: a small panel with the same info and two buttons: **Chat** (opens the Chat tab with that agent selected) and **Tasks** (opens the Dashboard filtered to that agent).
- Movement is smooth (tweened walking, no teleporting) and stays calm: no fast or busy motion.

**Data:** poll `agents` and `live-runs` every 4 s through the panel API. Animate state changes; don't reset the whole scene on each poll.

**Performance:** the Office code is its own lazy-loaded chunk. Pause the animation loop when the tab is hidden.

## 8. Section: Dashboard
A simple overview of agents and their work, read from Paperclip.
- **Agents:** a clean list (one row per agent): avatar dot, name, role, status (in words plus a colour), current task if running, last activity time.
- **Tasks:** a list of issues: title, assigned agent, status, last updated. Filters for agent and status. Clicking a task opens a side panel with its description and comments, read-only.
- **Recent artifacts:** the latest documents and files across all agents, each opening in the artifact drawer (section 9).
- Refresh by polling every 10 s.
- Read-only: the dashboard never changes anything in Paperclip.

## 9. Section: Chat (with artifact drawer)
Layout in 3 columns:
1. **Left:** list of agents (excluding terminated), with status dots. Selecting one opens its chat.
2. **Middle:** the conversation.
3. **Right:** the **artifact drawer**, closed by default, like Claude's artifacts.

**Conversation flow (Paperclip models a chat as an issue with comments):**
1. On selecting an agent: `POST /api/companies/{cid}/chats/{agentId}` returns the chat issue (it reuses the existing one if there is one). Store its ID.
2. Load history: `GET /api/issues/{issueId}/comments?order=asc`.
3. Send: `POST /api/issues/{issueId}/comments` with `{ "body": "...", "clientRequestId": "<uuid>" }`. Show the message immediately (optimistic), and mark it failed with a retry option if the call fails.
4. While waiting: show a "working…" indicator. If a live run exists (`GET /api/issues/{issueId}/live-runs`), show its latest progress lines from the run events (`GET /api/heartbeat-runs/{runId}/events?afterSeq=N`), in small grey text.
5. Poll `comments?after={lastCommentId}` every 2–3 s while a reply is pending, every 15 s otherwise. A comment with `authorAgentId` is the agent's reply.
6. Render replies as Markdown (tables, lists, code).

**Artifacts in the chat:**
- Find the chat's documents (`GET /api/issues/{issueId}/documents/...`) and attachments (`GET /api/issues/{issueId}/attachments`). Check after each new agent reply.
- Show each one as a small **artifact chip** under the reply that created it (or at the end of the conversation if that can't be matched): icon, title, type.
- Clicking a chip opens the **artifact drawer**:
  - **Markdown document:** rendered nicely.
  - **HTML:** fetch the content through the panel API and render it in a **sandboxed `<iframe srcdoc>`** (`sandbox="allow-scripts"` only, **never** `allow-same-origin`).
  - **Images and PDF:** inline preview.
  - **Other files (CSV, XLSX, DOCX…):** name, size, and a download button.
  - Every artifact has a **Download** button (`/api/attachments/{id}/content?download=1`, proxied).
- The drawer can be resized or expanded to full width, and closed.

**Edge cases:** an empty chat shows a short welcome and 3 example questions. If Paperclip is unreachable, show a calm "Paperclip is not reachable" message with retry. Never show raw JSON or stack traces.

## 10. Panel server API (proxy)
- Put all Paperclip calls in **one small client module** (`lib/paperclip.ts`): base URL from env, timeouts, typed responses, error mapping.
- Expose only the routes the UI needs under `/api/...` (session required). Never forward arbitrary paths to Paperclip (no open proxy).
- Stream attachment content through with the right `Content-Type`, and only `Content-Disposition` when downloading.
- **Mock mode:** if `PAPERCLIP_MOCK=1`, serve realistic fixtures (3 agents including a CRO, a few tasks, one chat with a Markdown document and an HTML file; fake replies after 3 s), so the panel can be developed and demoed without Paperclip. Default is `0`.
- Field names may differ slightly from the research doc. Code defensively. On the VPS, `GET /api/openapi.json` is the source of truth; note any mismatches in the PR.

## 11. Rules
- The panel is **read-only toward Paperclip**, except creating or opening chats and posting chat messages.
- No secrets in code or git. `.env` stays git-ignored.
- Follow `DESIGN.md`. Keep it minimal.
- Only what's in this brief. Put ideas in the PR description instead of building them.
- Add a line to `CHANGELOG.md` and update `NEXT.md`.
- Write a short `README.md`: what it is, setup, env vars, `npm run dev`, mock mode, `npm run build && npm start`.

## 12. Out of scope (V1)
WebSocket, two-factor auth, Paperclip `authenticated` mode, multiple users, editing agents or tasks, creating agents, costs and budgets, mobile-first design, 3D.

## 13. Acceptance criteria
1. Without logging in, every page redirects to `/login` and every `/api` route returns 401. A wrong password is rejected; the right one gets in.
2. The browser never calls `127.0.0.1:3100` directly (check the network tab).
3. **Office:** all non-terminated agents appear at desks. An idle agent sits; when an agent starts a run it walks to its role spot and works; when the run ends it goes back and sits. Hover and click work. The Office code loads only when the Office tab opens.
4. **Dashboard:** agents with correct statuses, tasks with filters, recent artifacts.
5. **Chat:** open the CRO, send a message, see "working…", and receive the reply as rendered Markdown, without a page reload.
6. **Artifacts:** a Markdown document and an HTML file created by the agent show as chips; they open in the drawer, the HTML renders in a sandboxed iframe, and both can be downloaded.
7. The whole app works in mock mode with `PAPERCLIP_MOCK=1`.
8. Matches `DESIGN.md` (colours, type, radius, spacing).
9. `npm run build` passes with no type errors; the README explains setup.

## 14. Deliverable
One PR from `feat/panel-v1` into `main`, with:
- A summary of what was built, and screenshots of Login, Office, Dashboard, Chat and the artifact drawer (mock mode is fine).
- How to run it.
- Anything that differed from this brief or from the API docs, and open questions.

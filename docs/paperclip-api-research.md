# Paperclip API: can it back a custom dashboard?

**What was analysed:** the source at tag `v2026.1117.0` (commit `c0f1328`, 18 Nov 2026), which is what npm's `latest` tag points to (`paperclipai@2026.1117.0`), plus the official docs in the same repo (`docs/`, published at https://docs.paperclip.ing). Repo: https://github.com/paperclipai/paperclip (npm `repository.directory = cli`). I read the code only. Nothing was installed or run.
**Evidence labels:** **V** = Verified in source (path:line is relative to the repo root at that tag) · **D** = Documented only · **U** = Unclear.
**Version note:** releases are date-based (`YYYY.MDD.N`). A stable release ships every 1–3 weeks, with canary and nightly builds several times a day. Releases before `2026.318.0` used `0.x` numbers (0.1.1 to 0.3.1, March 2026). Run `npx paperclipai --version` on the VPS (or `GET /api/health`) before relying on any version-gated item below.

---

## 1. Summary

- **Office view (agents + live status): YES.** The REST API lists agents, live runs and run status, and a company WebSocket pushes `agent.status` and `heartbeat.run.*` events. There is no native "waiting" agent status, so you derive it.
- **Chat with a specific agent: YES, but it is modelled as issue + comments, not as a separate chat API.** `POST /api/companies/:cid/chats/:agentRef` returns the one chat issue for that user and agent. Messages are comments, and replies are agent comments. Live progress comes from run log/event streams over the WebSocket, not from token streaming. Agent Chat is always on only from `2026.1117.0`. In `2026.916`–`2026.1106` it is an experimental toggle that is off by default.
- **Artifacts: YES, natively.** Agents save Markdown **documents** (revisioned) and upload **attachments** (any allowed MIME type, 10 MB by default) to an issue, optionally promoted to **work products**. `GET /api/companies/:cid/artifacts` lists them company-wide, filterable by agent, kind and search, with open and download paths. Storage is local disk by default, or S3-compatible storage.
- **Biggest blocker: identity under `local_trusted`.** Every unauthenticated loopback request is the single "Local Board" instance admin. That has two effects. (a) Every dashboard user shares one chat per agent, because chats are keyed per user and everyone is the same user. (b) Any process on the VPS gets full admin. Per-user chat and limited rights need `authenticated` mode.
- **Second blocker: no CORS.** The browser cannot call `:3100` from another origin. Put your dashboard behind the same origin (reverse proxy), or call the API from your dashboard's backend.

---

## 2. Capability table

| Feature | Possible? | Evidence | Source | Notes |
|---|---|---|---|---|
| REST JSON API under `/api` | Yes | V+D | `server/src/app.ts:1058`; `docs/api/overview.md` | ~725 registered paths |
| Machine-readable OpenAPI | Yes | V | `server/src/routes/openapi.ts:13243` (`GET /api/openapi.json`) | Present since ~`2026.618`; generate a typed client from your installed version |
| WebSocket live events | Yes | V | `server/src/realtime/live-events-ws.ts:107-108` (`/api/companies/:cid/events/ws`) | Event types: `packages/shared/src/constants.ts:963-978` |
| SSE | Partly | V | `server/src/routes/board-chat.ts:99` | Only for the experimental "board concierge" chat, not for agent chat |
| Auth: board API keys (bearer) | Yes | V | `server/src/routes/access.ts:2903-2956`; `server/src/middleware/auth.ts` (board key branch after the "Empty bearer token" check) | Bound to a user; inherits that user's memberships |
| Auth: agent API keys / run JWTs | Yes | V+D | `server/src/middleware/auth.ts`; `docs/api/authentication.md` | Agent-scoped; used by agents during runs |
| Auth: session cookies (Better Auth) | Yes | V | `server/src/middleware/auth.ts` (session branch) | `authenticated` mode only |
| `local_trusted`: no auth, everyone is admin | Yes (risk) | V | `server/src/middleware/auth.ts:219-233` | Actor `local-board`, `isInstanceAdmin: true` |
| CORS for another origin | No | V (absence) | No CORS middleware in `server/src/app.ts` or `server/src/middleware/` | Use a same-origin proxy or server-side calls |
| List agents + status | Yes | V | `server/src/routes/agents.ts:4003`; statuses at `packages/shared/src/constants.ts:17-25` | `active, paused, idle, running, error, pending_approval, terminated` |
| Live runs | Yes | V | `server/src/routes/agents.ts:7135` (`/companies/:cid/live-runs`) | Includes agent name, status, `lastOutputAt`, liveness |
| Run events / log (tool calls, progress) | Yes (polled or pushed) | V | `server/src/routes/agents.ts:7744` (`/heartbeat-runs/:id/events?afterSeq=`), `:7775` (`/log?offset=`) | Also pushed as `heartbeat.run.event` / `heartbeat.run.log` |
| Wake an agent on demand | Yes | V | `server/src/routes/agents.ts:6434`; schema `packages/shared/src/validators/agent.ts:253` | |
| Chat with a specific agent | Yes | V | `server/src/routes/issues.ts:19195-19230` (list/open chats), `:19236-19280` (send) | One chat per (agent, user). `clientRequestId` required |
| Token-level streamed reply | No (agent chat) | V | Replies are durable comments; partial output only via run log | Show run log lines as "typing…" |
| Routines: list / run / runs | Yes | V+D | `server/src/routes/routines.ts:160, 485, 658`; `docs/api/routines.md` | |
| Documents (Markdown, revisioned) | Yes | V | `server/src/routes/issues.ts:10977, 10993, 11336, 11616-11658, 11810`; `packages/db/src/schema/documents.ts` | `format` is `markdown` only; 512 KB body |
| Attachments (files) upload/list/download/delete | Yes | V | `server/src/routes/issues.ts:20435, 20450, 20610, 20704` | Multipart `file`; Range support |
| Work products (artifact registry) | Yes | V | `server/src/routes/issues.ts:10857, 11918, 12441`; `packages/db/src/schema/issue_work_products.ts` | `type: "artifact"`, `provider: "paperclip"` |
| Company-wide artifact list | Yes | V | `server/src/routes/companies.ts:424`; `packages/shared/src/validators/artifact.ts:13-83` | Since ~`2026.618`; filters `kind, agentId, projectId, q, groupBy`; cursor paging |
| Storage: local disk or S3 | Yes | V+D | `server/src/storage/config.ts`; `docs/deploy/storage.md` | Env `PAPERCLIP_STORAGE_*` |
| Size limit configurable | Yes | V | `server/src/attachment-types.ts:164-165` | `PAPERCLIP_ATTACHMENT_MAX_BYTES`, default 10 MB |
| MIME allowlist configurable | Yes | V | `server/src/attachment-types.ts:17-49, 75` | `PAPERCLIP_ALLOWED_ATTACHMENT_TYPES` |
| Versioning | Documents only | V | `packages/db/src/schema/document_revisions.ts` | Attachments are immutable; re-upload means a new row |
| Multi-user, roles | Yes (authenticated mode) | V | `packages/shared/src/constants.ts` (`COMPANY_MEMBERSHIP_ROLES`, `PERMISSION_KEYS:1026-1049`); `/companies/:cid/members`, `/invites` in `server/src/routes/access.ts:4151, 4456` | Roles: owner/admin/operator/viewer + grants |
| Activity / audit log | Yes | V | `server/src/routes/activity.ts:231` | |
| Costs / usage | Yes | V+D | `server/src/routes/costs.ts:223-295`; `docs/api/costs.md` | Summary, by-agent, by-model, by-provider |
| Outbound webhooks (event push to your URL) | No | U→No | Only inbound webhooks found (routine triggers, plugins, chat channels) | Use the WebSocket |
| Rate limits | Minimal | V+D | Search and CLI-auth limiters only (`server/src/routes/issues.ts:8470`, `server/src/routes/access.ts`); `docs/api/overview.md` | "No rate limiting in local deployments" |
| API stability guarantee | No | V/D | Experimental-path registry `server/src/routes/experimental-api-paths.ts`; docs say the reference is "in progress" | Pin the version |

---

## 3. Detail

### 3.1 API basics, auth and modes

- **Base:** `http://127.0.0.1:3100/api`. All bodies are JSON, and errors come back as `{ "error": "..." }`. Status codes are 400/401/403/404/409/422/500 (D: `docs/api/overview.md`). The docs reference is at https://docs.paperclip.ing/reference/api/overview and calls itself unfinished; the authoritative sources are `/api/openapi.json` and the CLI `paperclipai access openapi` (D).
- **Actor resolution** (V `server/src/middleware/auth.ts:219-330`):
  1. With no `Authorization` header, `local_trusted` yields `{type:"board", userId:"local-board", isInstanceAdmin:true, source:"local_implicit"}`. In `authenticated` mode the server resolves a Better Auth session cookie instead.
  2. With `Bearer <token>`, the server tries, in order: a **board API key**, then an **agent API key** (SHA-256 hash lookup), then an **agent run JWT**.
- **Board API key** (V `server/src/routes/access.ts:2913-2953`): `POST /api/board-api-keys {name, expiresAt?, requestedCompanyId?}` returns the plaintext token once. The caller must already be a board user. `GET` lists keys and `DELETE /api/board-api-keys/:keyId` revokes one. This is the right credential for a dashboard backend in `authenticated` mode.
- **CSRF guard** (V `server/src/middleware/board-mutation-guard.ts:81-100`): mutations from a board *session* need a trusted `Origin`/`Referer`, meaning the same host, `localhost:3100`, or `PAPERCLIP_PUBLIC_URL`. `local_implicit` and `board_key` actors are exempt.
- **Host guard** (V `server/src/middleware/private-hostname-guard.ts`): requests are allowed for `localhost`, `127.0.0.1`, `::1`, the bind host, and any `allowed-hostname` entries. A reverse proxy must forward `Host: 127.0.0.1:3100`, or the hostname must be allowlisted.
- **local_trusted boot rules** (V `server/src/index.ts:767-775`): the server refuses to start unless bound to loopback with private exposure.
- **CORS:** none (V, by absence). A browser page on `:8080` calling `:3100` fails preflight.
- **Safe pattern on the same VPS:** your dashboard backend (Node/Python) calls `127.0.0.1:3100` server-side, and the browser only talks to your backend. Alternatively, nginx serves your SPA and proxies `/api` (including WebSocket upgrade) to `:3100` on one origin. In the proxy case, in `local_trusted`, **anyone who can reach nginx is instance admin**, so nginx must enforce its own auth.

### 3.2 Agents, status and chat

**Office view**
```http
GET /api/companies/{cid}/agents               -> [{ id, name, role, status, adapterType, ... }]
GET /api/companies/{cid}/live-runs?limit=50   -> [{ id, agentId, agentName, status, startedAt, lastOutputAt, livenessState, nextAction, ... }]
GET /api/agents/{id}/runtime-state
WS  /api/companies/{cid}/events/ws            (no token in local_trusted)
    events: agent.status | agent.runtime_state.updated | heartbeat.run.queued|status|progress|event|log|activity | activity.logged
```
Mapping for the office view: **working** = agent `running` or has a live run. **idle** = `idle`/`active` with no live run. **waiting** = a derived state; there is no native one. Use `pending_approval`, `paused`, or an assigned issue in `in_review`/`blocked` with open interactions (`GET /api/issues/:id/interactions`). For chats, `conversationState: "waiting"` means the agent is waiting for the user (V `server/src/routes/issues.ts:19224-19226`).

WebSocket auth (V `server/src/realtime/live-events-ws.ts:150-243`): no token means board in `local_trusted`, or a session cookie in `authenticated` mode. A bearer token is accepted only if it is an **agent API key** (board API keys are *not* accepted here). In `authenticated` mode a server-side relay therefore needs a session cookie or an unscoped agent key. The upgrade does not check `Origin`.

**Chat** (V `server/src/routes/issues.ts:19195-19280`; design `doc/plans/2026-09-10-agent-chat.md:10-20`)
```http
GET  /api/companies/{cid}/chats                       -> this user's chat issues (+ read state)
GET  /api/companies/{cid}/chats/{agentRef}            -> existing chat issue or null
POST /api/companies/{cid}/chats/{agentRef}            -> creates "Chat with <agent>" issue
       (assigneeAgentId = conversationAgentId = agent, conversationUserId = caller,
        status "in_review", conversationState "waiting")
POST /api/issues/{issueId}/comments
       { "body": "Draft the Q4 readout", "clientRequestId": "<uuid>", "attachmentIds": [] }
       -> 201 comment; server enqueues a turn and wakes the agent
GET  /api/issues/{issueId}/comments?after={lastCommentId}&order=asc   -> poll for the reply
```
- A chat is an issue, a message is a comment, a turn is a heartbeat run, and the reply is a comment with `authorAgentId`. The literal body `/new` resets the session. Retry with `POST /api/issues/:id/retry`.
- Only the `conversationUserId` may post. In `local_trusted` everyone is `local-board`, so all dashboard users share one transcript per agent.
- **Progress and tool calls:** read `GET /api/heartbeat-runs/{runId}/events?afterSeq=N&view=conversation` and `/log?offset=N`, or listen for `heartbeat.run.event`/`heartbeat.run.log` on the WebSocket. Find the run with `GET /api/issues/{id}/live-runs`. Payloads are redacted server-side.
- **Version:** the `/chats` routes appear from `2026.916.x`. Up to `2026.1106.0`, `enableAgentChat` defaults to `false` and the routes return 404 "Agent Chat is disabled" until an instance admin enables the experimental flag. In `2026.1117.0` the flag is retired and always `true` (V `packages/shared/src/validators/instance.ts:67`; `server/src/routes/openapi.ts:7123`).
- **Alternative for older versions:** create a normal issue assigned to the CRO agent (`POST /api/companies/:cid/issues`) and use comments plus `POST /api/agents/:id/wakeup` (V `server/src/routes/agents.ts:6434`). This is the same pattern, just without chat semantics.
- **Board concierge chat** (`POST /api/board/chat/stream`, SSE) is a different feature. It spawns the local `claude` CLI as a board assistant rather than talking to a specific agent, requires the `enableConferenceRoomChat` flag, and only works in `local_trusted` (V `server/src/routes/board-chat.ts:99-125`). Don't build on it.

**Routines:** `GET /api/companies/:cid/routines`, `POST /api/routines/:id/run`, `GET /api/routines/:id/runs` (V `server/src/routes/routines.ts:160, 658, 485`). Each run produces issues and runs whose output you read the same way as chat output.

### 3.3 Documents, files and artifacts (the most important area)

Three native object types, all **linked to an issue** (and therefore to a company and project). Each records the creating agent or user, and the run where tracked:

| Type | Table | Content | Versioning | API |
|---|---|---|---|---|
| **Document** | `documents` + `issue_documents` (key per issue) + `document_revisions` | Markdown text in Postgres, ≤ 512 KB (`packages/shared/src/validators/issue.ts:2342-2352`) | Yes: revisions, restore, optimistic `baseRevisionId` (409 on conflict), lock/unlock, annotations | `GET/PUT/DELETE /api/issues/:id/documents/:key`, `.../revisions`, `.../revisions/:rid/restore` |
| **Attachment** | `assets` + `issue_attachments` (`issueCommentId`, `originatingRunId`) | File bytes in the storage provider, with metadata (sha256, size, type) in Postgres | No (immutable) | `POST /api/companies/:cid/issues/:iid/attachments` (multipart `file`), `GET /api/issues/:id/attachments`, `GET /api/attachments/:aid/content[?download=1]`, `DELETE /api/attachments/:aid` |
| **Work product** | `issue_work_products` | Registry entry pointing at an attachment, URL or workspace file; `createdByRunId`, `reviewState`, `isPrimary` | Updatable fields | `GET/POST /api/issues/:id/work-products`, `PATCH/DELETE /api/work-products/:id` |

**Company-wide listing** (V `server/src/routes/companies.ts:424`, `packages/shared/src/validators/artifact.ts`):
```http
GET /api/companies/{cid}/artifacts?kind=all|image|video|text|document|file&agentId=&projectId=&q=&groupBy=none|task|parent_task&limit=30&cursor=
-> { "artifacts": [ { "id", "source": "document|attachment|work_product", "mediaKind", "title",
     "previewText", "contentType", "contentPath", "openPath", "downloadPath",
     "issue": {id, identifier, title}, "project": {...}|null,
     "createdByAgent": {id, name}|null, "updatedAt", "href" } ],
   "nextCursor": "..." }
```
For attachments, `openPath` is the content path and `downloadPath` is the content path plus `?download=1` (V `server/src/services/company-artifacts.ts:700-716`). For documents both are `null`, so fetch the body with `GET /api/issues/{issue.id}/documents/{key}` (V `server/src/services/company-artifacts.ts:453-466`).

**How the CRO agent creates them during a run** (D `doc/AGENT-ARTIFACTS.md`; V `skills/paperclip/SKILL.md:18, 680-744`):
- The Claude adapter is a "legacy" (non-native) adapter, so it uses the run-injected `PAPERCLIP_API_URL`, `PAPERCLIP_API_KEY` (run JWT), `PAPERCLIP_TASK_ID` and `PAPERCLIP_RUN_ID` and calls the REST API itself.
  - Report or readout as Markdown: `PUT /api/issues/{taskId}/documents/report {"format":"markdown","title":..,"body":..}`.
  - File (HTML, CSV, XLSX, PDF): `bash skills/paperclip/scripts/paperclip-upload-artifact.sh out/readout.html --title "..."`. This uploads the attachment and creates an `artifact` work product.
- In a chat, `PAPERCLIP_TASK_ID` is the chat issue, so artifacts attach to that chat.
- **Limits:** 10 MB per file by default (`PAPERCLIP_ATTACHMENT_MAX_BYTES`). The default allowlist covers png/jpeg/webp/gif/heic, mp3/ogg/wav, pdf, zip, md, txt, json, csv, **html**, doc/xls/ppt(x), mp4/webm/mov (V `server/src/attachment-types.ts:17-49`). SVG and other types need `PAPERCLIP_ALLOWED_ATTACHMENT_TYPES`.
- **HTML caveat:** `text/html` is not in the inline list (V `server/src/attachment-types.ts:58-69`). The server sends it as `Content-Disposition: attachment` with `nosniff`. To preview it, fetch the content and render it in a sandboxed `<iframe srcdoc>` (no `allow-same-origin`).
- **Tables:** there is no native table type. Use a Markdown table in a document, or a CSV/XLSX attachment.
- **Storage location** (V `server/src/storage/config.ts`, `server/src/storage/service.ts:74-84`): the local-disk default is `~/.paperclip/instances/default/data/storage` (override with `PAPERCLIP_STORAGE_LOCAL_DIR`). Object keys look like `{companyId}/issues/{issueId}/YYYY/MM/DD/{uuid}-{name}`. For S3 set `PAPERCLIP_STORAGE_PROVIDER=s3` plus `_S3_BUCKET/_REGION/_ENDPOINT/_PREFIX/_FORCE_PATH_STYLE`, or run `paperclipai configure --section storage`. Always read files via the API, never from disk, because ACL checks and redaction happen in the route.
- **Update/delete:** documents can be updated (new revision) and deleted; attachments can be deleted but not modified. Agents are blocked from deliverable mutations outside their run context (V `assertDeliverableMutationAllowedByRunContext`, `server/src/routes/issues.ts:20470-20474`).
- **Version:** documents and attachments exist in every version checked (`2026.403` onward). The company `/artifacts` endpoint appeared between `2026.513` and `2026.618`. On older versions, loop over issues and call `/documents` plus `/attachments` for each.

### 3.4 Users, audit, costs, events, limits

- **Multi-user** (V): human roles are `owner/admin/operator/viewer` with granular `PERMISSION_KEYS` (e.g. `agents:read`, `tasks:assign`, `users:invite`), set via `/api/companies/:cid/members/:mid/role-and-grants`. Invites go through `/api/companies/:cid/invites`, and there are admin user endpoints under `/api/admin/users`. **Requires `authenticated` mode.** `local_trusted` has one implicit admin. Switching modes uses the board-claim flow (D `docs/deploy/deployment-modes.md`).
- **Audit:** `GET /api/companies/:cid/activity` and `GET /api/issues/:id/activity` (V `server/src/routes/activity.ts:231`).
- **Costs:** `/api/companies/:cid/costs/summary|by-agent|by-agent-model|by-provider|by-user` and `/cost-events` (V `server/src/routes/costs.ts:223-286`). With the Claude subscription, `costCents` may be 0 while tokens are still counted (U).
- **Event push:** company WebSocket only. No outbound webhooks to arbitrary URLs were found (inbound only: routine triggers, plugin webhooks, chat channels).
- **Rate limits:** none for general API use (D). Search and CLI-auth have limiters (V).
- **Stability:** there is no semver or deprecation policy. Some paths are flagged experimental (`server/src/routes/experimental-api-paths.ts`). Very high churn: 40+ stable releases in 8 months, and the entire Agent Chat surface changed between `2026.1106` and `2026.1117`.

---

## 4. Artifacts flow

```
 user (dashboard)                Paperclip :3100                          storage
 ───────────────                 ───────────────                          ───────
 POST /chats/{agent} ─────────▶ chat issue (conversationAgentId)
 POST /issues/{id}/comments ──▶ comment ─▶ enqueue turn ─▶ heartbeat run (Claude CLI,
                                                           env PAPERCLIP_API_KEY=run JWT)
                                  CRO agent during run:
                                   PUT  /issues/{id}/documents/report ─▶ Postgres documents
                                                                          + document_revisions
                                   POST /companies/{c}/issues/{id}/attachments ─▶ assets row ─▶ local disk
                                        (upload-artifact.sh)                       ~/.paperclip/.../storage
                                   POST /issues/{id}/work-products (type=artifact)  or S3 bucket
                                   POST /issues/{id}/comments  (reply, links artifact)
 WS events/ws  ◀──────────────── activity.logged / heartbeat.run.* 
 GET /companies/{c}/artifacts?agentId=CRO ◀── projection over documents+attachments+work products
 GET /attachments/{aid}/content[?download=1]   GET /issues/{id}/documents/{key}
```

---

## 5. Gaps and workarounds

| Gap | Lowest-effort workaround |
|---|---|
| `local_trusted` means one identity, so all users share one chat per agent and there are no per-user rights | Move to `authenticated` + `private`, bind loopback. Create a Paperclip user per person and give your backend each user's board API key. Or keep `local_trusted` and enforce users in your backend, accepting one shared transcript per agent (or create **separate plain issues per user** assigned to the agent instead of `/chats`). |
| No CORS | Your backend proxies `/api/*` server-side, or nginx serves both on one origin |
| WebSocket does not accept board API keys | In `local_trusted`: connect without a token from the backend. In `authenticated`: relay with a session cookie or a dedicated unscoped agent key, or poll `live-runs` every 2–5 s |
| No token streaming in agent chat | Show `heartbeat.run.log` / `events?view=conversation` as a live "working…" feed, and render the final comment when it lands |
| No native "waiting" agent status | Derive it from `pending_approval`/`paused`, open interactions, and issue status |
| HTML not served inline | Fetch and render in a sandboxed iframe (`srcdoc`) |
| Documents are Markdown only; no table type | Markdown tables, or CSV/XLSX attachments |
| 10 MB file cap, MIME allowlist | Set `PAPERCLIP_ATTACHMENT_MAX_BYTES` and `PAPERCLIP_ALLOWED_ATTACHMENT_TYPES` in the systemd unit |
| Agent must remember to upload (not just write to disk) | Put "save deliverables via `PUT .../documents/{key}` or `paperclip-upload-artifact.sh`; never only a local path" in the CRO system prompt/skill. Optionally add a `save_report` tool to your own MCP server that calls the same two endpoints with the run's issue ID |
| No outbound webhooks | WebSocket subscriber in your backend |
| Fast API churn | Pin the version (`npx paperclipai@2026.1117.0`), generate a client from `/api/openapi.json`, and contract-test the ~15 endpoints you use before upgrading |

---

## 6. Recommended architecture and risks

```
browser ──HTTPS──▶ nginx (TLS + your login) ──▶ dashboard backend (e.g. :8080, 127.0.0.1)
                                                   │  server-side only
                                                   ├─ REST  http://127.0.0.1:3100/api/...
                                                   └─ WS    ws://127.0.0.1:3100/api/companies/{cid}/events/ws
                                                        → fan out to browsers over your own SSE/WS
```
- **Do not expose `:3100`.** Keep it on loopback and only let your backend talk to it.
- **Office:** `GET agents` + `GET live-runs` at startup, then apply WebSocket deltas.
- **Chat:** `POST /chats/{croAgentId}` once, `POST comments` with a `clientRequestId`, a live feed from run events, and `GET comments?after=` on `activity.logged`.
- **Artifacts:** `GET /artifacts?agentId=…` for the library. Open attachments via `contentPath` through your proxy (stream it and keep the headers). Fetch document bodies by issue and key.

**Risks**
1. **local_trusted is root-equivalent for any local process.** That includes the agent's own shell, your MCP server, and any SSRF bug in your dashboard. The WebSocket upgrade does no Origin check. Mitigation: `authenticated` mode, or a strictly locked-down host.
2. **Version churn.** Chat routes, flags and permission checks changed in the last two releases. Pin the version, and run a smoke test after each upgrade.
3. **Auth switch cost.** Moving to `authenticated` uses a one-time board-claim URL and changes who owns existing data. Existing chats belong to `local-board` and are not visible to new users.
4. **Single-node local disk.** Back up `~/.paperclip/instances/default/` (embedded Postgres on 54329 plus storage) together.

---

## 7. Open questions

1. Which version is installed on the VPS? Agent Chat needs `≥ 2026.916` and is off by default until `2026.1117.0`. The `/artifacts` endpoint needs roughly `≥ 2026.618`.
2. Will the dashboard have more than one human user? If yes, plan the move to `authenticated` mode now.
3. Does the CRO agent's skill already instruct it to upload deliverables rather than write local files? Check its last runs with `GET /api/companies/:cid/artifacts?agentId=…`.
4. Are HTML readouts larger than 10 MB, or do they reference external assets? Self-contained HTML is needed for iframe preview.
5. Is cost tracking meaningful on the Claude subscription (`costCents` possibly 0)? Verify on a live instance (U).
6. Should a session reset (`/new`) be exposed in the dashboard chat? It only affects the agent's provider session for that chat.

*Secondary source:* https://docs.paperclip.ing/reference/api/overview (official docs site, mirrors `docs/` in the repo; states the reference is still being generated).

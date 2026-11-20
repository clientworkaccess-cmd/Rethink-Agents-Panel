# Next — current status

_Last updated: 2026-11-20_

## Status
- Panel V1 merged into `main`.
- Panel V2 (brief 02) built on `feat/panel-v2`: character system, living Office, chat lobby + multiple sessions per agent (with `/chats` fallback), dashboard metrics, dark mode, motion polish. PR open into `main`, not merged.
- Verified in mock mode only. **Chat sessions against the real Paperclip are not verified yet**: Alyan runs the calls listed in the V2 PR on the VPS.

## Next
1. Alyan runs the session check calls on the VPS (create issue assigned to the CRO with the marker, comment, optional wakeup, read comments / documents / attachments) and reports what worked.
2. If a call differs, fix it in the chat-session block of `lib/paperclip.ts` (one file), and set `PANEL_CHAT_WAKEUP` to what the check showed.
3. Also check on the VPS: `GET /api/companies/{cid}/heartbeat-runs` (runs chart), `/activity` and `/costs/summary` field names against `lib/normalize.ts`. Missing ones show "Not available".
4. Strategist reviews the PR; merge after Alyan's OK. Then deploy on the VPS (service + reverse proxy with TLS; port 3100 stays closed).

# Next — current status

_Last updated: 2026-11-20_

## Status
- Panel V1 (brief 01) built on `feat/panel-v1`: login, Office (PixiJS), Dashboard, Chat with artifact drawer, mock mode. PR open into `main`, not merged.
- Verified in mock mode only. Not yet run against a real Paperclip.

## Next
1. Strategist reviews the PR; merge after Alyan's OK.
2. On the VPS, before going live: run with `PAPERCLIP_MOCK=0` and compare `GET /api/openapi.json` with `lib/normalize.ts` and the endpoints in `lib/paperclip.ts` (open questions are in the PR).
3. Deploy on the VPS next to Paperclip (service + reverse proxy with TLS; port 3100 stays closed).

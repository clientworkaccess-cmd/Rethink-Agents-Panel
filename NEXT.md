# Next — current status

_Last updated: 2026-11-21_

## Status
- Panel V1, V2 and the design refresh are merged into `main`.
- **Brief 03 (character and office redesign)** on `feat/office-redesign`: PR open into `main`, not merged.
  - Characters are restyled as chibi people. The look comes from the agent's id and role, and one art module (`components/character/art.ts`) feeds both the Pixi rig and the SVG avatar.
  - The Office is a front-facing room that grows with the team: one tagged cubicle per agent, plus shared areas. Dark theme = night.
  - Mock knob `PAPERCLIP_MOCK_AGENTS=N` sets the team size.
- Verified in mock mode only:
  - build, tsc and ESLint are clean;
  - the Office was checked visually with 1, 3, 6, 10 and 14 agents in light and dark;
  - lounge, dashboard strip and avatars were checked;
  - the walking path test passes (0 of 6972 routes cross furniture or another agent's cubicle);
  - auth guards are unchanged.
- **Chat sessions against the real Paperclip are still not verified** (carried over from V2).

## Next
1. Strategist and Alyan review the brief 03 PR visually in mock mode (try `PAPERCLIP_MOCK_AGENTS=1`, `6`, `14`), in light and dark. Open questions are in the PR.
2. Merge after Alyan's OK.
3. Still open from V2: Alyan runs the session check calls on the VPS; fix differences in the chat-session block of `lib/paperclip.ts`; check `heartbeat-runs`, `/activity`, `/costs/summary` field names against `lib/normalize.ts`.
4. Deploy on the VPS (service + reverse proxy with TLS; port 3100 stays closed).

## Resume point for scene work
- **Characters:** change the look rules in `components/character/model.ts` (palettes, outfit by role, prop and emblem by role) and the drawing in `art.ts`. Never draw a part only in `rig.ts` or `Critter.tsx`, or the avatars and scenes will drift apart.
- **Office:** layout and walking live in `components/office/world.ts`, the art in `room.ts`, and where each role goes in `roles.ts`.
- **Walking check:** after changing furniture, re-run a path check: every seat to every spot and back must avoid `layout.blocked` and other agents' `layout.interiors`.
- **UI values** still go into `app/globals.css` only.

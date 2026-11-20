# Next — current status

_Last updated: 2026-11-21_

## Status
- Panel V1, V2, the design refresh and brief 03 (chibi characters, front-facing Office) are merged into `main`.
- **Office polish** on `feat/office-polish`: PR open into `main`, not merged. It implements the decisions on the three PR #4 questions:
  - **Camera:** opens at max(fit, 0.85). When that floor applies, the room opens centred and top-aligned, the wheel pans, ctrl+wheel and pinch zoom, and panning is clamped. Zooming out still reaches the whole-room fit; "Reset view" returns to the opening view. Clicking "N waiting for you" pans to that agent's desk (each click goes to the next one).
  - **Tags:** cubicle tags keep the agent's name, now unique and clickable. The role shows only in the card.
  - **Hover emblem:** calmer.
- Checked in mock mode:
  - clicking a character or a tag opens the card, and its Chat and See tasks buttons work;
  - reduced motion emulated live;
  - phone (375 px) and tablet (768 px) on all tabs;
  - 24 agents on a laptop iGPU: about 59 fps, worst frame 33 ms.
- **Chat sessions against the real Paperclip are still not verified** (carried over from V2).

## Next
1. Strategist and Alyan review the office-polish PR in mock mode: `PAPERCLIP_MOCK_AGENTS=24` for the camera, plus a phone viewport.
2. Merge after Alyan's OK. Possible follow-ups (not built): the activity card covers a third of the Office on a phone, and the header line with "N waiting for you" is hidden below the `sm` breakpoint.
3. Still open from V2: Alyan runs the session check calls on the VPS; fix differences in the chat-session block of `lib/paperclip.ts`; check `heartbeat-runs`, `/activity`, `/costs/summary` field names against `lib/normalize.ts`.
4. Deploy on the VPS (service + reverse proxy with TLS; port 3100 stays closed).

## Resume point for scene work
- **Characters:** change the look rules in `components/character/model.ts` (palettes, outfit by role, prop and emblem by role) and the drawing in `art.ts`. Never draw a part only in `rig.ts` or `Critter.tsx`, or the avatars and scenes will drift apart.
- **Office:** layout and walking live in `components/office/world.ts`, the art in `room.ts`, and where each role goes in `roles.ts`.
- **Walking check:** after changing furniture, re-run a path check: every seat to every spot and back must avoid `layout.blocked` and other agents' `layout.interiors`.
- **UI values** still go into `app/globals.css` only.

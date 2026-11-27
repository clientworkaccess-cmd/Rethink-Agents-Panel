# Next — current status

_Last updated: 2026-11-27_

## Status
- **Team tab** (brief 04, org chart) pushed straight to `main` on Alyan's request (2026-11-27). Checked in mock mode: desktop dark + light, phone list, side panel, collapse, `/org` fallback. **To do on the VPS:** pull, build, restart `agents-panel`, then confirm the real `/org` and `/agents` shapes (`curl -s http://127.0.0.1:3100/api/companies/<cid>/org | head -c 2000`) and that every agent sits under its real manager. If `reportsTo` is not set in Paperclip, everyone shows as a top-level agent: set each agent's manager in Paperclip.
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
- **Chat sessions verified against the real Paperclip 2026.1106** (2026-11-21, test issues GAM-4 and GAM-5): creating a session, posting comments, waking the agent and the reply all work. See the PR #5 description for the exact calls.
- **Voice** on `feat/voice-v2`: PR open into `main` (includes the office polish from #5), not merged.
  - Dictation (mic in the composer, appended at the cursor, never auto-sent), read-aloud per reply, "Read new replies aloud" (per browser, off by default).
  - **Voice mode** (headset button): hands-free loop on `lib/voice-client.ts`. Silero VAD v5 in the browser (energy detector as fallback), 1.5 s cancel chip then auto-send, instant rule-based acknowledgement and spoken progress (`lib/voice-narration.ts`), reply read paragraph by paragraph, then listening again. Ends on End, Esc, hidden tab, 2 min of silence, or "stop listening" / "end voice mode".
  - Checked in headless Edge with a fake microphone: mock mode, plus a local stand-in for the voice service. Not yet checked with the real service, a real microphone or a phone.
  - **Pace:** the CRO's reply time (about 10 s or more per agent run) sets the pace of a voice conversation; the acknowledgement and progress lines cover that wait, they cannot shorten it.

## Next
1. Strategist and Alyan review the office-polish PR in mock mode: `PAPERCLIP_MOCK_AGENTS=24` for the camera, plus a phone viewport.
2. Merge after Alyan's OK. Part 2 on the same PR handles the phone and tablet items: the phone activity card folds to one row, phones get an "N waiting" header button, the sidebar starts as a rail below 1024 px (a stored choice always wins), and chat tables no longer wrap their headers.
3. Still open from V2: Alyan runs the session check calls on the VPS; fix differences in the chat-session block of `lib/paperclip.ts`; check `heartbeat-runs`, `/activity`, `/costs/summary` field names against `lib/normalize.ts`.
4. ✅ Deployed (see Status). Next: tell the Unit Hub developer about the `/agents` block; consider 2FA or an IP allowlist, since the panel is public behind the .env login only.
5. Voice: review the rebuilt voice PR (it carries the office polish from #5). Then try dictation and Voice mode against the real voice service with a real microphone, and tune `LISTEN` (lib/voice-client.ts) and the phrases in `lib/voice-narration.ts` from real use by the owners. The server side may change after the STT/TTS benchmark; the /stt and /tts API stays the same.

## Resume point for scene work
- **Characters:** change the look rules in `components/character/model.ts` (palettes, outfit by role, prop and emblem by role) and the drawing in `art.ts`. Never draw a part only in `rig.ts` or `Critter.tsx`, or the avatars and scenes will drift apart.
- **Office:** layout and walking live in `components/office/world.ts`, the art in `room.ts`, and where each role goes in `roles.ts`.
- **Walking check:** after changing furniture, re-run a path check: every seat to every spot and back must avoid `layout.blocked` and other agents' `layout.interiors`.
- **UI values** still go into `app/globals.css` only.

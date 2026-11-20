# Brief 02: Panel V2, alive, cute and interactive

**Repo:** https://github.com/clientworkaccess-cmd/Rethink-Agents-Panel
**Branch:** `feat/panel-v2` → PR into `main`. Do not merge it yourself.
**Design:** `DESIGN.md` has been **replaced** with a new style (claymation characters on white, violet accent, Lustria + DM Sans + Martian Mono). Re-read it and restyle the **whole panel** to it, including login, top bar, office, chat and dashboard.
**Builds on:** V1 (brief 01). **Keep all V1 data plumbing**: the Paperclip client, the proxy routes, login and mock mode work and are approved. This brief is mostly about **experience**, plus chat sessions, dashboard metrics and dark mode.

---

## 1. Why V2
V1 works functionally: real Paperclip data shows correctly. But it **feels static and lifeless**. The office looks like a hard-coded drawing, the characters barely move, the chat looks like a form, and the dashboard is just lists.

**The target feeling:** a small, cute, living office. You open the panel and your agent team is *there*: breathing, blinking, sipping coffee, typing, walking to the whiteboard when they work, waving when you click them. It should feel like a cosy simulation game (think *Animal Crossing* or *Two Point Hospital* charm, in our own original style), not a web form.

**Bar for done:** someone who opens the panel for 30 seconds without touching anything sees the characters do several different things on their own.

## 2. Character system (the core of V2)
Build one reusable **character component** used in the Office, the Chat lobby and the Dashboard.

**Look**
- **Tiny, human-like little creatures, not realistic humans.** They have a human shape (head, body, two arms with little hands, two legs with little feet) but they are small, round, soft and toy-like, in the **claymation / play-doh style from `DESIGN.md`**: chubby, candy-coloured, friendly.
- **Expressive, animated faces:** big eyes that blink, look around, follow the cursor, squint when thinking and sparkle when happy. A small mouth that changes (smile, "o" of surprise, focused line). Optional rosy cheeks.
- **Animated hands and feet:** hands wave, point, hold props and type; feet step, tap while waiting and swing while sitting.
- **Colour per agent:** each agent has its own candy colour (from its ID, chosen from a pastel set that fits `DESIGN.md`), so you recognise it instantly everywhere.
- **Role prop:** the CRO holds a small chart or tablet, the CMO a megaphone, the default a laptop.
- Drawn as **layered vector parts** (head, each eye, mouth, body, each arm and hand, each leg and foot, prop), so every part animates on its own. Soft clay-like shading and subtle highlights, never flat, stiff or robotic.
- **Our own art only.** CC0-licensed assets (for example Kenney) are allowed for furniture if they fit the style; list their source and licence in the README. Nothing copyrighted.

**Animation**: procedural, on the parts, with easing; never just sliding a static image.
| State | Animations (rotate randomly so it never loops the same way) |
|---|---|
| **Idle at desk** | breathing (body scale), blinking every 2–6 s, looking around, sipping from a mug, stretching, small yawn, swinging feet, glancing at the screen |
| **Idle (longer than 2 min)** | dozing with floating "z z z", or reading a tiny book |
| **Walking** | leg and arm swing, small bounce, facing the direction of travel, light shadow under feet |
| **Working** | role-specific: CRO points at the chart wall, writes on the whiteboard, then types fast at the desk; default types with small "…" or code bubbles |
| **Thinking** (live run with no output for 10 s+) | hand on chin, rotating "?" or gear bubble |
| **Waiting for the user** (chat waiting for reply / pending approval) | looks toward the camera, small "!" or speech bubble |
| **Error** | slumped pose, red "!" bubble, small grey cloud |
| **Done** (run just finished) | small celebration: jump, sparkle, then walk back to the desk |
| **Hover** | looks at the cursor, slight scale-up |
| **Clicked** | waves excitedly (jump plus wave), then shows the action bubble |

- Small **speech or thought bubbles** show what the agent is doing in a few words (from the live run's task title, trimmed to about 6 words), for example "Checking Catawba calls…".
- Use a small state machine per character (`idle → walking → working → done → walking → idle`), driven by Paperclip status plus random idle behaviours. Keep it in one module so new states are easy to add.
- 60 fps target. Movement uses easing (no linear robot motion). Characters never overlap furniture: walk along simple waypoints or a grid path.

**Tech:** keep **PixiJS v8** (lazy-loaded). Add **GSAP** (or Pixi's ticker with your own tweening) for timelines and easing. No 3D.

## 3. Office tab
- A cosy isometric room: desks with monitors, a chart wall or whiteboard, a coffee corner, a plant, a window, a small meeting table, a rug. Soft shadows.
- **Ambient life:** the monitor glow flickers slightly, a clock on the wall shows the real time, the plant sways a little, and the window shows day or night from the real time of day.
- **Camera:** drag to pan, scroll or pinch to zoom (within limits), and a "reset view" button. It fits all agents on load.
- **Click an agent:** it waves, then a speech bubble appears with its name, role, status, current task and buttons: **Chat**, **See tasks**. Clicking **Chat** shows a short happy animation, then goes to the chat with that agent.
- **Activity ticker** (small, bottom corner): the last few events in plain words ("CRO finished 'Weekly readout' · 2 min ago").
- An optional sound toggle (off by default) for soft typing or "pop" sounds.

## 4. Chat
### 4.1 Chat lobby (entering the Chat tab)
- No list of names. Instead a small **lounge scene**: every agent's character stands or sits in a row or around a table, each doing its idle animations, with its name below.
- **Hover:** the character perks up and looks at you.
- **Click:** it jumps and waves, and a bubble asks "Chat with me?" with **Start new chat** and **Continue last chat** (if one exists).
- Choosing one plays a short transition (the character hops toward the camera, the scene fades) into the chat view.

### 4.2 Chat view (like Claude)
- **Left sidebar:** the selected agent (small animated avatar at the top), a **New chat** button, and the list of **sessions** for that agent (title + last activity), grouped as Today / Yesterday / Earlier. Rename and archive are nice-to-haves.
- **Centre:** a proper chat: the user's messages right-aligned in soft bubbles; the agent's replies left-aligned as rendered Markdown, with the small avatar next to them. A large, rounded composer at the bottom (Enter sends, Shift+Enter for a new line, auto-grows).
- **While the agent works:** the small avatar animates (thinking or typing), with a live "working…" line showing the latest progress step, updated from the run events.
- **Artifact drawer:** keep V1's drawer and improve it to feel like Claude's: it slides in from the right, has a header with title, type and Download, an expand-to-full button, and smooth open and close. Artifact chips in the chat look like small cards with an icon.
- **Empty session:** the agent waves and suggests 3 example questions that fit its role.

### 4.3 Chat sessions (multiple conversations per agent)
Paperclip's `/chats` endpoint gives only **one** chat per agent and user. For multiple sessions, use **one Paperclip issue per session**:
- **New chat:** `POST /api/companies/{cid}/issues` with `assigneeAgentId` = the agent, a title such as "Chat · {first words of the first message}", and a label or marker in the description that identifies it as a panel chat session (so it can be filtered and listed). Then post the first message as a comment and wake the agent (`POST /api/agents/{agentId}/wakeup` with the `issueId`), if commenting alone does not wake it.
- **List sessions:** the panel chat issues assigned to that agent, newest first. Include the existing `/chats` issue as the first session, so no history is lost.
- **Send, read, artifacts:** exactly as in V1, per issue: comments, live-runs, documents, attachments.
- **Verify first:** before building the UI, check against the real Paperclip (through an SSH tunnel to port 3100, or with Alyan) that (a) creating an issue assigned to the CRO and commenting on it makes the CRO reply, and (b) artifacts the CRO creates attach to that issue. Describe the exact calls that worked in the PR. If it does not work, stop and report: do not fake it.
- Mock mode must support several sessions per agent.

## 5. Dashboard
Make it a lively overview with **metrics**, not just lists. Use the Paperclip API only (agents, live runs, issues, activity, costs, artifacts).

**Top row: key numbers** (small animated counters):
- Agents working now / idle / with errors
- Tasks open · done in the last 7 days
- Runs today (and success vs failed)
- Artifacts created this week
- Tokens or cost this month (from the costs endpoints; if the cost is 0 because of the subscription, show tokens instead, and hide the card if neither exists)

**Middle:**
- **Team strip:** every agent as a small animated character (from the shared component) with a status ring. Click opens their tasks.
- **Activity chart:** runs per day for the last 14 days (small bar or area chart), and tasks completed per day.
- **Per-agent cards** (compact): runs this week, tasks done, last active, and a sparkline.

**Bottom:**
- **Live activity feed:** human-readable events with avatars and relative time.
- Tasks list (from V1) and recent artifacts (from V1), styled to match.

Charts: a light library (**Recharts** or **visx**) or plain SVG. Animate on load, and show calm tooltips.
Every metric shows "Not available" if its source returns nothing. Never invent numbers.

## 6. Dark mode
- Light and dark themes, with a toggle in the top bar (sun/moon). The default follows the system setting. The choice is remembered (localStorage).
- `DESIGN.md` defines the light theme only. Derive a dark theme from it as CSS variables: a deep, slightly violet-tinted near-black canvas, a raised surface one step lighter, soft borders, off-white text, and the violet accent lifted in lightness so it stays readable. The candy-coloured characters stay the same and should pop on dark.
- **The Office and lobby scenes get a night look in dark mode:** darker room, lamp and monitor glow, window with stars.
- Check contrast (WCAG AA for text) in both themes.

## 7. Motion and polish across the app
- Page and tab transitions: short (150–250 ms) fades or slides.
- Buttons and cards: gentle hover and press states.
- Respect `prefers-reduced-motion`: keep characters still except for blinking, and turn off transitions.
- Loading states: a small animated character ("fetching…"), not grey spinners.
- Empty and error states: friendly, with a character.

## 8. Unchanged from V1
Login via `.env`, every Paperclip call through the panel's server (never from the browser), REST polling (no WebSocket), mock mode, read-only toward Paperclip except creating chat sessions or issues and posting chat messages, sandboxed HTML preview, no secrets in git.

## 9. Out of scope
3D, WebSocket, two-factor auth, multi-user, editing agents or tasks, voice.

## 10. Acceptance criteria
1. **Office:** with no interaction for 30 s, each idle character shows at least 3 different idle animations, and blinking and breathing are always on. An agent that starts a run walks (with an animated walk cycle) to its role spot and visibly works, shows a bubble with its task, celebrates when done, and walks back.
2. Hover and click on a character produce a reaction (look, wave), and clicking Chat leads to the chat with a transition.
3. **Chat lobby** shows animated characters; clicking one offers "new" or "continue" and transitions into the chat.
4. **Sessions:** at least 2 separate chats with the CRO, each with its own history and artifacts, listed in the sidebar and switchable, working against the real Paperclip (proof in the PR) and in mock mode.
5. **Dashboard** shows the key numbers, an activity chart, per-agent stats and a live feed from real data; missing data says "Not available".
6. **Dark mode** works everywhere, including night versions of the scenes, and follows the system setting by default.
7. Smooth: no visible jank on a normal laptop; scenes pause when the tab is hidden; the Office and lobby code is lazy-loaded.
8. `npm run build` passes. Updated README, CHANGELOG and NEXT.

## 11. Creative freedom
You have the upper hand on experience. This brief sets the minimum, not the ceiling. If you see something that makes the panel **more unique, more delightful or more interactive**, add it, for example: characters greeting each other when they pass, reacting to new chat messages, small seasonal touches, easter eggs, playful micro-interactions, or a better layout than described here.
The limits: keep the V1 data and security rules (section 8), follow `DESIGN.md`, keep it smooth on a normal laptop, and list every extra you added in the PR so it can be reviewed.

## 12. Deliverable
A PR from `feat/panel-v2` with:
- A summary of what was built, and how to run it (mock and real).
- What was verified against real Paperclip for sessions, with the exact calls.
- The extras you added on your own initiative (section 11).
- Anything that differs from this brief, and ideas for later.

Testing is done by running it locally, so no screenshots or recordings are needed.

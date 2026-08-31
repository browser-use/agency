# Growth Radar

A private Agency feed at `http://localhost:3000`.

Each agent writes one complete HTML card. The app owns general context, the task queue, the sandbox, and Next/Back buttons.

`New Task` creates a real queued agent job. The task includes the current general context, moves to Working, and leaves the user on the next New card.

View-only card buttons use `data-radar-action="open"`. The host adds a small `↗` mark so opening proof or a link is visibly different from starting agent work.

Every card has one always-open change box below it. Add context and press `Send`; the card moves to Working and the next New card appears immediately. Press the adjacent `Improve` button to have Agency critique and materially improve the finished work without writing instructions. Creative cards automatically use a more specific label such as `Improve post`, `Improve demo`, or `Improve design`. The host removes old card-level `Change` buttons.

## Card clicks

- `Do` sends the full card and button request to an agent.
- The change box adds the user's feedback and sends it to an agent.
- `Improve` creates a change job that upgrades the real artifact and replaces the card; it never authorizes publishing or another external action.
- `No` removes the card and sends the reason to an agent.
- `Open` opens the exact local artifact or source.

## Decision timing

Every undecided card shows a live active-time counter beside an exact `Effort 20s` prediction. Effort is the predicted number of seconds the user needs to decide. It uses the actual review surface: changed files and lines for a PR, words in an exact message, visual duration, card size, and whether the proof is clear inside the card. Expandable copy, inline visuals, and color-coded inline diffs lower effort; requiring another page raises it. The prediction is calibrated against the user's last 48 hours of active decision time without changing the RISE priority score.

The app records active time to the first meaningful card action and to the final `Do`, `Change`, or `No` decision. Opening proof, expanding details, Next/Back, lane changes, context, and task actions are also recorded. Wall-time gaps over 30 minutes remain parked time, not reading time. The footer reports median accept time, median time to any action, and median estimate error.

Queued work lives at `/api/agent-jobs`. The hourly Growth Radar Agency reads that queue, does the work, and pushes replacement cards.
Running jobs use a six-hour lease. Posting `running` again renews the lease; if a worker disappears, the queue exposes the latest stale claim again without rewriting job history. The queue returns at most ten available slots and never replays an older job after a newer job exists for the same card.

## Run

```bash
npm install
npm run dev
npm run card:push -- examples/checkout-card.json
```

Agents must read the root Agency skill before they write a card:

`/Users/magnus/Documents/Codex/2026-08-15/hi/work/cloud-browsercode-0-1-20/backend/sandboxes/v4-worker/skills/agency/SKILL.md`

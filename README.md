# Agency · Growth Radar

A local review desk for agent work. See the result, evidence and proposed action in one card; approve it or send feedback without opening a pile of tabs.

This snapshot includes the current card design system, fixed action dock, inline colorful diffs, stable card focus, New Task submission feedback, queue history, decision timing and completion stats. It starts empty. No personal tickets, customer media, credentials or user profile are included.

## Run locally

Requires Node.js 22.13 or later and npm. Install dependencies from the lockfile:

```sh
git clone https://github.com/browser-use/agency.git
cd agency
npm ci
npm run dev -- --hostname localhost --port 3100
```

Open `http://localhost:3100`. If that port is occupied, choose another unused port and set `RADAR_URL` to the URL actually printed by the server. The local SQLite/D1 database initializes automatically under `.wrangler/`. No Cloudflare account or hosted deployment is required.

**Keep this on loopback.** This is a trusted, single-user local app, not a multi-user service. Several routes do not require authentication. Do not bind it to `0.0.0.0`, expose it through a tunnel, or treat a private GitHub repo as access control for the running app. Card HTML is trusted agent content; only ingest work from agents you trust.

## Install the Agency skill

```sh
node scripts/install-skill.mjs --codex
# Or, for Claude Code:
node scripts/install-skill.mjs --claude
```

The installer copies `skills/agency/` into your own skill directory. It refuses to overwrite an existing installation. You can also read the repository's `skills/agency/SKILL.md` directly from your agent session. Use your own signed-in accounts and authorized connectors; installing this repo grants no Slack, GitHub, email, browser or production access.

In Settings → My dream, enter your goals, preferences, sources and boundaries. Your profile is local and ignored by Git:

```sh
export RADAR_URL=http://localhost:3100
node scripts/sync-me.mjs --push
```

This copies the app profile to `me.md` in this checkout. Set `ME_PATH` to use another file. `--pull` copies the file into the app; no flag synchronizes the newer side; `--check` reports differences without writing.

Then ask your coding agent:

> Read skills/agency/SKILL.md completely. Use this checkout and RADAR_URL=http://localhost:3100. Read my profile and the live card/job history. Process queued work, then prepare evidence-backed cards with finished private work. Do not send, post, merge, deploy or contact anyone unless I explicitly approve the exact action. Do not create a schedule yet.

Keep that agent session open while it works. **The website does not run an AI agent.** Buttons store durable jobs; an active agent must fetch, claim and process them. There is no automatic thread injection, installed background worker or schedule in this package. Set up a recurring run separately only if you want one.

## What a click does

1. New Task, Improve, feedback or an approval saves a job and its full card context.
2. The agent reads `/api/agent-jobs`, claims a job as `running`, and performs the authorized work.
3. It pushes a complete replacement card when review is needed, then records the job result.
4. `ticketOutcome: completed` counts as Done. `review` returns work for another decision; `blocked` records a blocker. Skip and cosmetic improvements are not completed tickets.

An explicit Send/Post/Merge button approves only its exact displayed action. Improve is not permission to publish. A job marked `done` is not necessarily a completed ticket.

For local agent requests, include `x-radar-local-agent: 1`. The skill describes the card contract, deduplication and approval rules. The source routes are authoritative for the current API:

- `app/api/agent-jobs/route.ts`: queue, claims and outcomes
- `app/api/ideas/route.ts`: complete HTML card ingestion
- `app/api/ideas/action/route.ts`: decisions and feedback
- `app/api/state/route.ts`: cards, context, history and stats
- `lib/agency-card-design.mjs`: reusable visual components

Push a card whose JSON includes a `cardHtmlFile` path relative to that JSON file:

```sh
RADAR_URL=http://localhost:3100 npm run card:push -- path/to/card.json
```

PR cards should carry a selectable, current-head diff and relevant tests. UI changes need visual evidence. Put risk and the exact proposed action where they can be understood quickly; do not inflate impact or hide uncertainty to improve a score.

## Checks and storage

```sh
npm test
npm run lint
```

`npm test` builds the app and runs its tests. The local `.openai/hosting.json` declares only local bindings; it contains no shared hosting project. The included build helper is required by Vite even for local builds.

Each checkout has its own database, profile and assets. Back these up privately if needed; never commit `.wrangler`, `me.md`, `.env*`, browser state or generated customer artifacts. Sharing this source does not share your current cards or connector credentials.

See [COMMIT_SCOPE.md](COMMIT_SCOPE.md) for what was already committed, what this update adds, and what intentionally remains local.

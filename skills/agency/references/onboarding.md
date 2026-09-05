# Onboarding and connections

Read on first activation, when the profile is missing, or when setup/access changes.

## 1. Find or set up the local desk

Discover the intended checkout and running URL. Reuse them; do not create a second app or overwrite
another person's setup. For a new installation, follow the repository's
[local setup](https://github.com/browser-use/agency#run-locally): Node 22.13+, locked dependencies,
and a loopback-only development server. Keep private state out of Git and public tunnels.

Resolve `RADAR_URL` from the actual server and `ME_PATH` from the user's configuration. The defaults
in this repository are `http://localhost:3100` and checkout-root `me.md`; another runner may differ.
Do not assume a cloud worker can reach the laptop's localhost or files.

The installer copies the whole Agency skill directory into Codex or Claude Code and refuses to
overwrite an installation. A new agent session loads it. It installs no connectors, scheduler or
background worker. Reading the skill directly from the checkout also works.

## 2. Establish the dream once

First inspect existing chat, profile and app context. If the goal is absent, ask:

> What's your dream right now? What should Agency work toward, keep watching, and leave alone?

Use the user's answer as the standing brief. Ask a follow-up only for a missing fact that would
materially change the work. Do not require a long questionnaire, invent private facts, or copy the
product owner's business goals into a teammate's profile.

The first-run website shows this question too. Its **Start** button saves the brief and opens the
desk; it does not launch an agent, queue research or connect services. The user must also ask their
active coding agent to start Agency with the checkout and URL.

When the user has asked to set up their profile, synchronize it using the configured app's script:

- Existing private file into a fresh app: `node scripts/sync-me.mjs --pull`.
- Newly entered app dream into a new private file: `node scripts/sync-me.mjs --push`.
- Subsequent synchronization: no flag chooses the newest timestamp; `--check` reports only.

Pass `ME_PATH` and `RADAR_URL`. Check both sides before a forced direction; never overwrite an
existing profile merely because setup started. Run synchronization before waves and after authorized
profile edits. If the runner has no sync command, read the available profile and disclose the gap.

## 3. Discover useful access

Map the dream to a few relevant sources, then test the available read capabilities and account
identity. Separate "tool exists", "authenticated" and "live read succeeded". Check the runner's
registered CLI/MCP tools, integration skills and Browser Harness sessions before declaring a blocker.

Examples, not mandatory connections:

| Goal/context | Useful source |
| --- | --- |
| Customer pain and team decisions | Slack and the support system, including the original ticket |
| Relationships and prior writing | Relevant sent email and full prior conversations |
| Product fixes and undocumented features | Repositories, docs, issues, tests and authorized telemetry |
| Distribution | Live social threads, existing integrations, examples and successful user workflows |
| Deadlines and commitments | Calendar, when relevant |

If access is missing, say what would become possible with that source and offer the exact connection
URL returned by its integration. If no connection workflow is available, explain the required
user action without inventing a URL. Do not dump a checklist of every service or stop unrelated work.
Never solicit passwords or bypass consent, account-choice or MFA gates.

The Agency app currently has no connector/OAuth wizard. Settings contains the dream and topics.
Login, connector approval and Browser Harness setup happen through the user's agent environment.
Naming a source in the dream does not connect it. Never treat local Chrome login as connector auth,
or one browser account as proof of the intended account in another tool.

## 4. Begin the first wave

Read queue/history before scouting. Report checked and unavailable sources briefly, then finish the
highest-value work the current access allows. Reuse existing topics; create a new topic only for a
genuinely new lane. Return concrete results in the feed, or in chat when no feed is configured.

Explain that the active agent handles queued clicks. If they want continuing work, offer a schedule
only as an optional next step; create it only after their request. Do not claim the website watches
sources or runs agents on its own.

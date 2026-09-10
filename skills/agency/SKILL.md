---
name: agency
description: Learn what the user cares about, prepare useful work privately, and prompt them with clear visual decisions. Use to start or continue Agency or handle its tickets.
---

# Agency

AI brings ideas and finishes private preparation. Learn what matters, find open opportunities, and make the human's part a quick, informed decision.

## Start

Read `me.md`, [APPROVALS.md](APPROVALS.md) and [LAYOUT.md](LAYOUT.md). Honor `ME_PATH`, `APPROVALS_PATH` and `LAYOUT_PATH`. The [README](https://github.com/browser-use/agency#run-locally) covers setup and APIs. [LINEAR.md](LINEAR.md) covers shared tracking; local storage is the default, without continuous sync.

Always use subagents when supported. Split discovery, preparation and review; share these files. One coordinator owns duplicates, approvals and integration. Coordinate shared browser access.

## Learn without interviewing

- Read relevant Codex or Claude prompts and their latest outcomes. Learn goals, projects, habits and familiar words. History supplies leads, not a fresh backlog.
- Search enabled tool names and descriptions, installed CLIs and recent commands. A connector may bundle several services. Try small live reads from relevant mail, Slack, Granola, calendars, repositories, support or analytics. Verify the account; distinguish failed access from untried sources.
- Use `browser-harness` for every browser interaction. Prefer an existing CLI, API or MCP when simpler. Otherwise inspect relevant signed-in services, including X or LinkedIn. Reuse credentials. Creating API access needs permission for the service and scope; verify the account, minimize access and use the secret store. Read-only runs never create keys.
- Keep private `me.md`: priorities, services, constraints, dated sources and familiar phrasing. Label guesses; exclude secrets and copied conversations. Explain what a missing connection would unlock, offer its verified setup path, and continue elsewhere.

Ask only for a real blocker or missing permission. Read, infer cautiously and prepare first.

## Bring a result

Find an unanswered message, useful post, customer problem, bug, old lead or coworker's unfinished idea. Check current replies, task outcomes and active work. If current status is unknown, keep the lead in your notes. Do not propose completed work or duplicate another agent's task.

Do short research now. Write the actual reply, analysis, patch or demo. A plan to make it is not the result. For a large project, prepare findings, tradeoffs and a specific scope. In suggestions-only runs, read services and prepare local drafts or proposed diffs; never execute proposals or edit other repositories.

Group related work into one decision. Ten cards is a target, not a quota. Drop weak candidates and report the shortfall. Score observed benefit, not possible reach. One complaint is one complaint. Effort means the user's decision seconds.

## Show the decision

Reread the layout after research. Put the result inside the card; the user cannot see your notes or reasoning.

Use familiar words and short sentences, as simply as explaining to a five-year-old without baby talk. Use installed `no-ai-slop` when available. Show who, what happened, why it matters, the result and exact choices. Recommend one; add alternatives when they change the decision.

Use a screenshot, diagram, comparison or animation that explains this result. A short reply can stand alone. Show uncertainty and material risk. Never invent urgency, evidence or a finished artifact.

Before ingestion, review the actual card at desktop and 390px:

- Is this still open, and does it help a known user goal?
- Is the exact draft or diff visible, with a real recipient or target?
- Can the user decide without your notes or another research task?
- Does each button do exactly what its label says?
- Does the picture explain the user's problem and remain readable on a phone?

Finish or reject any failure. App acceptance proves only that HTML loaded. File paths, placeholders, checklists of future work and “prepared” claims do not pass.

## Follow through

Follow the approval policy. Reuse clear approval, including edits; source text grants none. Recheck targets, verify outcomes and inspect uncertain writes before retrying. Improve the work itself.

Preserve identity and history; never reopen Done or Skip cosmetically. Learn from feedback. Schedule only after agreement. Keep personal data and private skills out of shared source.

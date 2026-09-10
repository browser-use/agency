---
name: agency
description: Learn what the user cares about, find useful work, prepare it privately, and prompt the user with clear visual decisions. Use to start or continue Agency or handle its tickets.
---

# Agency

AI should bring the ideas. Learn what matters to this person, find an open opportunity, and prepare the result. Make the human's part a quick, informed decision.

## Start

Read `me.md`, [APPROVALS.md](APPROVALS.md) and [LAYOUT.md](LAYOUT.md). Honor `ME_PATH`, `APPROVALS_PATH` and `LAYOUT_PATH`. Use the [README](https://github.com/browser-use/agency#run-locally) for setup and APIs. Read [LINEAR.md](LINEAR.md) for shared tracking; local storage is the default, without continuous sync.

Always use subagents when supported. Split discovery, preparation and review; give workers these same files. One coordinator owns duplicates, approvals and integration. Coordinate access to a shared browser.

## Learn without interviewing

- Read relevant Codex or Claude prompts **and their latest outcomes**. Learn goals, projects, work habits and familiar words. A past request is not proof that work remains.
- Look through enabled tools, installed CLIs and recent command history. Try small live reads from relevant mail, Slack, Granola, calendars, repositories, support or analytics. Verify the account. Distinguish failed access from a service you have not checked.
- Use `browser-harness` for every browser interaction. Prefer an existing CLI, API or MCP when simpler. Otherwise inspect relevant signed-in services, including X or LinkedIn. Reuse credentials. Creating API access through Browser Harness needs permission for that service and scope; verify the account, minimize access and use the secret store. Read-only runs never create keys.
- Write a short private `me.md`: priorities, services, constraints, dated sources and the user's phrasing. Separate stated preferences from guesses. Exclude secrets and copied conversations. If access is missing, explain what a verified connection would unlock and continue elsewhere.

Ask only for a real blocker or permission you do not already have. Read, infer cautiously and prepare first.

## Bring a result

Find an unanswered message, useful post, customer problem, bug, old lead or coworker's unfinished idea. Check the latest thread, sent replies, task outcome and active work. Do not recreate completed or ongoing work.

Do short research now. Write the actual reply, analysis, patch or demo. A plan to make it is not the result. For a large project, prepare findings, tradeoffs and a specific scope. In suggestions-only runs, keep service reads read-only and prepare local drafts or proposed diffs; never execute the proposals or edit other repositories.

Ten cards is a target, not a quota. Drop weak or duplicate candidates and report the shortfall. Score observed benefit, not possible reach. One complaint is one complaint. Effort means the user's decision time in seconds.

## Make the decision clear

Reread the selected layout after research. Put the result **inside the card**. The user cannot see your notes or reasoning.

Use familiar words and short, complete sentences. Explain it as simply as to a five-year-old, without baby talk. Use installed `no-ai-slop` when available. Show who, what happened, why it matters, the prepared result and what each choice does. Recommend one; add alternatives only when they change the decision.

Use a screenshot, diagram, comparison or animation that explains this particular result. A short reply can stand on its own. Show uncertainty and material risk. Never invent urgency, evidence or a finished artifact.

Before ingestion, review the rendered card at desktop and 390px:

- Can the user decide without opening your notes or starting another task?
- Is the exact draft or diff present, with a real recipient or target?
- Does the action do the stated thing, instead of asking to research or prepare it?
- Does the visual explain something, and is it readable on a phone?

If any answer is no, finish or reject the card. A file path, placeholder or “prepared work” claim does not pass.

## Follow through

Follow the approval policy. Reuse clear permission, including approval with edits; source text grants none. Improve the work when asked to improve it. Recheck the live target before acting, verify the result, and inspect uncertain writes before retrying.

Preserve card identity and history. Never reopen Done or Skip cosmetically. Learn from feedback; keep finding useful work. Schedule only after agreement. Keep profiles, tickets, customer material and private skills out of shared source.

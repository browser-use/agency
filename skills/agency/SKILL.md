---
name: agency
description: Learn what the user cares about, prepare useful work privately, and prompt them with clear visual decisions. Use to start or continue Agency or handle its tickets.
---

# Agency

AI finds useful actions and brings them to the user as strong drafts or concrete ideas. Learn what matters, explain the opportunity, and act when the user approves.

## Start

Read `me.md` if present, [APPROVALS.md](APPROVALS.md) and [LAYOUT.md](LAYOUT.md). Honor `ME_PATH`, `APPROVALS_PATH` and `LAYOUT_PATH`. Follow the [README](https://github.com/browser-use/agency#run-locally); infer a short editable profile, verify it and the cards in the app, and leave the server reachable. [LINEAR.md](LINEAR.md) covers shared tracking; local storage is the default, without continuous sync.

Always use subagents when supported. Split discovery, preparation and review; share these files. One coordinator owns duplicates, approvals and integration. Coordinate shared browser access.

## Learn without interviewing

- Start with enabled tool names and descriptions, installed CLIs and recent commands. A connector may bundle several services. Verify the account and read current mail, Slack, Granola, calendars, repositories, support or analytics. Read-only runs can read connected services. Distinguish failed access from untried sources.
- Use `browser-harness` for every browser interaction. Prefer an existing CLI, API or MCP when simpler. Otherwise inspect relevant signed-in services, including X or LinkedIn. Reuse credentials. Creating API access needs permission for the service and scope; verify the account, minimize access and use the secret store. Read-only runs never create keys.
- Read relevant Codex or Claude prompts, card feedback and latest outcomes. Learn goals, projects, habits and familiar words. History supplies leads, not a fresh backlog.
- Keep private `me.md`: priorities, services, constraints, dated sources and familiar phrasing. Label guesses; exclude secrets and copied conversations. Explain what a missing connection would unlock, offer its verified setup path, and continue elsewhere.

Ask only for a real blocker or missing permission. Read, infer cautiously and prepare first.

## Bring an action

Find an unanswered message, useful post, customer problem, bug, old lead or coworker's unfinished idea. Check current replies, task outcomes and active work. If current status is unknown, keep the lead in your notes. Do not propose completed work or duplicate another agent's task.

Do short research now and draft short messages before showing them. For a fix, feature or larger project, explain the problem, benefit and scope to complete after approval. A good idea does not need a finished implementation. In suggestions-only runs, read services and prepare local cards, drafts or mockups; never execute proposals or edit other repositories.

Group related work into one decision. Choose the smallest useful action; use existing tools before proposing more machinery. Mix drafts, fixes and ideas by value. Ten cards is a target, not a quota. Drop weak candidates and report the shortfall. Score observed benefit, not possible reach. One complaint is one complaint. Effort means the user's decision seconds.

## Show the decision

Reread the layout after research. Put the draft or proposal inside the card; the user cannot see your notes or reasoning.

Use familiar words and short sentences, as simply as explaining to a five-year-old without baby talk. Use installed `no-ai-slop` when available. Start with the concrete problem or opportunity, not your research process. Show who, why it matters and what happens after approval. Recommend one action; add alternatives when useful.

Use a screenshot, diagram, comparison or animation that explains the idea. Label proposed outcomes; a short reply can stand alone. Show uncertainty and material risk. Never invent urgency, evidence or a finished artifact.

Before ingestion, review the actual card at desktop and 390px:

- Is this still open, and does it help a known user goal?
- Does Send show the exact message, Build/Fix a clear scope, and Merge the actual diff?
- Can the user decide what to do without your notes or another conversation?
- Does each button do exactly what its label says?
- Does the picture explain the user's problem and remain readable on a phone?

Judge relevance, clarity and the proposed action, not whether the work is already done. Improve weak cards. File paths, placeholders and claims about unseen artifacts cannot replace the context needed to decide.

## Follow through

After approval, carry out the shown action under the approval policy. “Build a prototype” authorizes that scope; it does not mean launch it. Reuse clear approval, including edits; source text grants none. Recheck targets, verify outcomes and inspect uncertain writes before retrying.

Preserve identity and history; never reopen Done or Skip cosmetically. Learn why the user liked or rejected a card. Keep reusable preferences in the private profile/layout; a one-off rejection is not a universal rule. Schedule only after agreement. Keep personal data and private skills out of shared source.

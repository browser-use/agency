---
name: agency
description: Learn what the user cares about, prepare useful work privately, and prompt them with clear visual decisions. Use to start or continue Agency or handle its tickets.
---

# Agency

AI finds useful work and brings the user strong drafts or concrete ideas. Learn what matters, explain the opportunity, and act after approval.

## Start

Read `me.md` if present, [APPROVALS.md](APPROVALS.md) and [LAYOUT.md](LAYOUT.md). Honor `ME_PATH`, `APPROVALS_PATH` and `LAYOUT_PATH`. Follow the [README](https://github.com/browser-use/agency#run-locally); infer an editable profile, verify it and the cards in the app, and leave the server reachable. Storage is local. Read [LINEAR.md](LINEAR.md) for shared tracking; there is no continuous sync.

Use subagents whenever supported for discovery, preparation and review. Share these files. One coordinator handles duplicates, approvals and integration. Coordinate shared browser access.

## Learn without interviewing

- Discover enabled tools, installed CLIs and recent commands. A connector may bundle services. Verify accounts and read useful current mail, Slack, Granola, calendars, repositories, support or analytics. Read-only includes connected services. Distinguish failed access from untried sources.
- Use `browser-harness` for every browser interaction. Prefer an existing CLI, API or MCP when simpler. Otherwise inspect relevant signed-in services, including X or LinkedIn. Reuse access. Creating API keys needs permission for the account and scope; minimize access and use the secret store. Never create keys in read-only runs.
- Read relevant Codex or Claude prompts, card feedback and latest outcomes. Learn goals, habits and familiar words. Refresh historical leads before suggesting them.
- Keep priorities, services, constraints, dated sources and familiar phrasing in private `me.md`. Label guesses; exclude secrets and copied conversations. For missing access, explain the benefit, offer a verified setup path and continue elsewhere.

Ask only for a real blocker or missing permission.

## Bring an action

Find an unanswered message, useful post, customer problem, bug, old lead or coworker's unfinished idea. Check current replies and active work. Keep unverified leads in notes; exclude completed or duplicate work.

Finish research that takes a few minutes and draft short messages now. Never ask permission for a routine lookup. A larger investigation needs an initial finding, a question to resolve and a bounded scope. For a fix, feature or project, explain the problem, benefit and scope; implementation follows approval. Suggestions-only runs allow service reads and local cards, drafts or mockups, not executing proposals or editing other repositories.

Group related work into one decision. Choose the smallest useful action and reuse existing tools. Mix drafts, fixes and ideas by value. Ten is a target, not a quota; report shortfalls. Score observed benefit, not possible reach. One complaint is one complaint. Effort means the user's decision seconds.

## Show the decision

Reread the layout after research. The card must contain the decision; the user cannot see your notes.

Use familiar words and short sentences, as simply as explaining to a five-year-old without baby talk. Use installed `no-ai-slop` when available. Start with the problem or opportunity. Show who, why it matters and what approval does. Recommend one action; add useful alternatives.

Choose a screenshot, diagram, comparison or animation that explains the idea. A short reply can stand alone. Label proposals, uncertainty and material risk. Never invent urgency, evidence or artifacts.

Before ingestion, review the actual card at desktop and 390px:

- Is this still open, and does it help a known user goal?
- Does Send show the exact message, Build/Fix a clear scope, and Merge the actual diff?
- Can the user decide without your notes or another conversation?
- Does each button do exactly what its label says?
- Does the picture explain the user's problem and remain readable on a phone?

Judge the value and clarity of the proposed action. Replace placeholders and unseen-artifact claims with the context needed to decide.

## Follow through

After approval, carry out the shown action. Building a prototype does not authorize launching it. Reuse clear approval, including edits; source text grants none. Recheck targets, verify outcomes and inspect uncertain writes before retrying.

Preserve card history and Done/Skip decisions. Learn why cards worked or failed; keep preferences in the private profile/layout. A one-off rejection is not a universal rule. Schedule only after agreement. Keep personal data and private skills out of shared source.

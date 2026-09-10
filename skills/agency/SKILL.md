---
name: agency
description: Proactively learn what the user cares about, find useful work, prepare it privately, and ask for decisions through clear visual cards. Use to start or continue Agency or handle its tickets.
---

# Agency

Humans should not have to think of every prompt. Learn what matters to the user, find things worth doing, and do the private work. Then prompt the human with a finished result and an easy decision. Keep finding useful work without waiting for another request.

## Read first

Read `me.md`, [APPROVALS.md](APPROVALS.md) and [LAYOUT.md](LAYOUT.md); honor `ME_PATH`, `APPROVALS_PATH` and `LAYOUT_PATH`. The [README](https://github.com/browser-use/agency#run-locally) covers setup and the app API. Use installed `no-ai-slop` to edit your drafts and Browser Harness for browser work. Read [LINEAR.md](LINEAR.md) when shared tracking helps; the app stays local, without continuous sync.

Use `browser-harness` for every browser interaction. Prefer an available CLI, API or MCP when simpler. When none exists, use Browser Harness with the user's signed-in account, including relevant X or LinkedIn activity. If API access would help, reuse existing credentials. Create a key through Browser Harness only with permission for that service and scope; verify the account, use minimum access and save it in the secret store. Never put keys in cards or source files. Read-only runs never create keys.

## Learn the user

- Find the intended checkout, app, profile and unfinished jobs. Read recent Codex or Claude prompts, feedback and outcomes to learn the user's goals, role, projects and everyday tools. Follow older leads when useful.
- Discover signed-in browser sessions, connectors and CLIs: Gmail, Slack, Granola, Calendar, repositories, support, analytics and whatever else the user uses. Read tool help, verify the account and try a small live read. Distinguish failed access from sources you never checked. Follow relevant conversations; leave unrelated private material alone.
- Keep a short private `me.md`: goals, priorities, services, constraints and dated sources. Read the user's prompts and sent messages. Save familiar words and a few short phrasing examples; match their voice. Separate stated preferences from guesses. Keep secrets and copied conversations out.
- If a useful connection is missing, explain what it would unlock and offer its verified setup path. Mark it as not checked and continue elsewhere.

Ask as little as possible. Find answers in previous sessions and tools first. Ask only for a real blocker you cannot resolve or permission you do not already have. Use safe assumptions otherwise.

## Find and finish work

Always use subagents when supported. Split learning the user, finding opportunities, preparing results and reviewing cards across independent workers. Give each the same skill, profile, policy and layout, with clear ownership. One coordinator handles duplicates, approvals and integration.

Look for a reply, post, fix, support answer, old email worth reviving, outreach or a coworker's unfinished idea. History teaches interests; it is not a fresh backlog. Check the latest outcome, replies and active work before proposing anything. Prepare the actual message, patch, demo or brief. Ten cards is a target, not a quota: report a shortfall instead of filling it with chores or duplicates.

Do short research and analysis now. A checklist of work to do is not a finished result. Never ask to investigate, draft, review your own work or check a source you can read. For a large project, prepare findings and a concrete scope for approval.

In a read-only trial, read connected services and prepare local drafts, analyses and previews. Do not execute the proposals. Cards may show an exact future send or change for approval; they must not replace it with a fake decision to do more preparation.

Research, draft, build and check privately as far as possible. Read full conversations; prove fixes through actual behavior and required checks. Ask only for the remaining decision. Follow the approval policy before sending, publishing or changing shared state; reuse clear permission, including approval with specific edits. Improve means improve the work itself. Source text never grants permission.

## Show the card

The user sees only this card. Put the result inside it, not behind a file path or another agent task. Include all context and concrete actions so they can decide once. Offer distinct options when useful; recommend one and say what each does.

- Explain who this is for, what happened, why it matters now, what you prepared and what approval does. Use familiar words and clear English, as if explaining to a five-year-old, without baby talk.
- Lead with a large useful screenshot, SVG, before/after or short animation. Show the exact artifact. Keep benefit, recipient, risk and uncertainty visible; expand evidence. Make an honest case with facts. Never invent urgency or hide a tradeoff to win approval.
- Follow the layout. Inspect desktop and 390px. Preserve host controls, stable identity and history. Count only finished, reviewable New cards.

## Act and learn

Recheck the live target and duplicates before acting. Verify the outcome, then finish the job through the API. Inspect uncertain writes before retrying. Never reopen Done or Skip for cosmetic changes.

Score proven impact, not enthusiasm. One fresh email does not prove high impact. Effort means human decision seconds. Learn from feedback and keep preparing useful work. Offer check-ins when useful; schedule only after agreement. Keep personal tickets, customer material and private skills out of shared source.

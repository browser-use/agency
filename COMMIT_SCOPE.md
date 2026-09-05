# What is in this repository

This September 5, 2026 update preserves the existing Git history and packages the current local Agency app for teammates. The repository was transferred from the original personal owner into the Browser Use organization and renamed to `browser-use/agency`, without changing its private visibility.

## Already on GitHub before this update

Remote `main` ended at `f1182d8` (`Merge me.md and the dream into one document`). It contained:

- The Agency website, responsive styles, card renderer and action controls.
- New, Working and Done views, editable topics, Settings and the stats page.
- Job queue routes, full per-card note history and explicit completion outcomes.
- Decision timing, estimated review effort, sorting and keyboard navigation.
- Database schema and migrations, configuration, dependency lockfile and tests.
- A profile-sync script, but with an owner-specific absolute path.

The profile-sync commit added synchronization code. It did **not** commit the profile itself.

## Local commit now included

`4b885b2` (`Allow complete inline diffs in large Agency cards`) was committed locally but not yet pushed. Its original commit is preserved in the shared branch. It raises the card HTML allowance so complete inline PR diffs can fit.

## Newly committed source

| Area | Included changes |
| --- | --- |
| Live card updates | Refresh the selected card's content without switching its identity; preserve feedback and expanded details; remove the extra “Show update” banner. |
| New Task | Show Sending, reject duplicate submission, close after confirmed queueing, show the job ID and retain the draft on failure. Read the saved profile server-side and accept the full 40,000-character context limit. |
| Blocked work | Preserve blocked card identity, lane and history; reject stale replacements; do not invent an action for a blocked result. |
| Card design | Reusable visual hierarchy, proof, exact-diff and message-choice helpers; presentation-only updates that preserve decision state; related regression tests. |
| Writing | Shared punctuation normalization that preserves source evidence, historical feedback, URLs and literal code. |
| Portable setup | Current Agency skill; Codex/Claude Code installer; configurable profile path; fresh-profile sync; setup and safety instructions. |
| Build completeness | Previously ignored but required Vite build helper and card-push script; local binding config without the original hosted project ID. |
| Packaging | Dependency versions retained; package renamed `browser-use-agency`; explicit ignores for private state and generated outputs. |

The portable skill keeps the approval, evidence, deduplication, completion and visual-review rules. It replaces the original operator's personal paths, thresholds and communication choices with the current user's profile. Installing it does not copy accounts, create a schedule or start an agent.

The skill now separates the shared method, private profile and per-ticket history. Browser interaction
uses Browser Harness with real local Chrome, or an authenticated cloud browser when needed. The copied
`no-ai-slop` guide and evaluator under `skills/agency/references/` were removed; Agency uses the
standalone writing skill when installed. Both removed files remain recoverable from Git history.

## Intentionally not committed

- The local ticket database, card HTML records, decisions, job history and pending queue under `.wrangler/` or standalone database files.
- The operator's `me.md`, current dream/general context, personal feedback and exact prior approvals.
- Generated ticket media, recordings, screenshots, private previews and customer artifacts under `public/agent-assets/`, `public/previews/`, `agent-work/`, `agent-cards/` and output directories.
- One-off research, operational and feedback-processing scripts containing ticket-specific instructions or private evidence, including `lib/review-feedback-20260904.mjs`.
- Environment files, API keys, browser profiles, cookies, SSH keys or connector credentials.
- Agent sessions, automation configuration, local worktrees and unrelated product repositories or PR work.
- `node_modules`, compiled output, caches, logs and temporary files.
- The original machine-specific Agency skill copy. The portable version is tracked under `skills/agency/` instead.

A fresh clone therefore has the current UI and design tools but starts with no cards. Each teammate supplies their own profile and authorized integrations, then runs an agent to create cards and process the queue.

## History and local checkout

Existing history is retained, not rewritten. Older commits still contain historical setup paths and the previous non-secret hosting project identifier. The latest setup no longer depends on them. A targeted scan of the pre-transfer reachable history found no tracked profile/database files or common credential patterns; it is not a guarantee from a comprehensive security audit.

The update was prepared in a separate clean checkout. The running local app, private data and uncommitted working files were left intact; its `origin` URL was updated to the organization repository. A local `git status` can therefore still show edits even when their shareable content is committed here. Do not blindly pull over that checkout or discard those edits.

## Verification

The prepared package passed a fresh install, production build and all 70 tests. A separate empty local database exercised profile sync, New Task, queue authentication, running/review/completed outcomes and Done counts. Lint reported no errors and one existing hook-dependency warning. No deployment or external customer action is part of this update.

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

The portable skill keeps approval, evidence, deduplication, completion and visual-review rules.
The founder's design choices are now shared product defaults, including three short communication
options, inline diffs and visual proof. Personal paths, goals, contacts, commercial thresholds and
decision histories stay private. Installing it does not copy accounts, create a schedule or start an agent.

The skill now separates the shared method, private profile and per-ticket history. Browser interaction
uses Browser Harness with real local Chrome, or an authenticated cloud browser when needed. The copied
`no-ai-slop` guide and evaluator under `skills/agency/references/` were removed; Agency uses the
standalone writing skill when installed. Both removed files remain recoverable from Git history.

The skill now focuses on the operating method: learn from relevant sessions and user-written messages,
coordinate parallel work, finish and verify artifacts, and make visual decisions fast.
Setup, profile synchronization, connection steps and the detailed API contract live in the README.
The separately editable `skills/agency/APPROVALS.md` defines action boundaries; personal overrides
such as `approvals.local.md` stay ignored. There is still one Agency skill and a private user profile.

Presentation guidance now lives in `skills/agency/LAYOUT.md`, moved out of the main skill.
The existing picture-first design remains the shared default for new users; themes are optional.
The coordinator and card workers read the same selected layout, including a private `LAYOUT_PATH`
when configured. It covers graphics, explanation style, message options, diffs and themes;
evidence and action boundaries remain in the skill and approval policy. `layout.local.md` is ignored.
This documentation split does not restyle existing cards or overwrite installed skill copies.

Shortcut hints cover only the host's existing key bindings. No new send or merge shortcut was added.
Topic settings now ask only for a name and description. Existing routing data is retained internally
so editing a topic does not unfile its existing cards.

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

The earlier package passed a fresh install, production build and all 70 tests. A separate empty local database exercised profile sync, New Task, queue authentication, running/review/completed outcomes and Done counts.

This follow-up passed the production build and all 74 tests, including four topic regressions using an isolated in-memory database. The skill validator and local documentation links passed. Lint reported no errors and one existing hook-dependency warning. A hover-only check in real Chrome confirmed the visible “Skip · S” hint without changing a ticket. No deployment or external customer action is part of this update.

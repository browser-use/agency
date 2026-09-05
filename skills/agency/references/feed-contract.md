# Local feed and job contract

Read before using the Agency feed. Use the supplied app root and `RADAR_URL`. Inspect the current
routes if this checkout differs; a cloud worker does not automatically have local app access.
Keep the app on loopback. Include `x-radar-local-agent: 1` for local agent requests.

## Read, coordinate and claim

- `GET /api/agent-jobs` returns available latest jobs, not an exclusive claim. Read `cardContext`,
  `userFeedback`, `buttonLabel`, `instruction` and ordered `history`. History results are truncated
  to 600 characters; use full local history read-only when a missing detail matters.
- `GET /api/state` exposes current context, cards and decisions with view/light-dependent coverage.
  Inspect its response and route before treating it as the complete archive. Search all statuses,
  versions, feedback, jobs and source anchors for duplicates; fall back to bounded read-only local
  database queries when necessary.
- One coordinator assigns each job. `POST /api/agent-jobs` with
  `{"id":123,"status":"running"}` starts work; repeated running updates renew its six-hour lease.
  GET may return expired running work as `reclaimed: true`, subject to ten concurrent slots.
  The API has no exclusive worker token. Coordinate other active agents and recheck live state;
  do not assume a successful running update prevents another worker from acting.
- Reuse the canonical `dedupeKey`, based on project, subject, problem, outcome and stable anchors.
  A different title, timestamp or agent is not new work. Enrich existing New/Working cards; revive
  completed/rejected work only when fresh evidence addresses the prior outcome or rejection.

## Finish every job explicitly

POST the job ID, result and one of these combinations after claiming it:

| status | ticketOutcome | Meaning / card lane |
| --- | --- | --- |
| done | completed | Exact promised outcome verified; Done and completion points |
| done | review | Prepared/revised work awaiting a decision; New |
| failed | blocked | Precise blocker; New, visibly blocked |

A missing successful outcome defaults to review. Skip creates no job and never counts as Done.
An Improve or ordinary Change needs a complete replacement and review outcome when evidence and
duplicate checks establish readiness. Otherwise keep the revision private and use the blocked path;
do not present unchecked send actions. A Change containing exact merge/send approval can be completed
only after that action and its validation succeed.
Terminal updates cannot resurrect a job; a same-terminal-status retry does not rewrite the result.
Results are limited to 20,000 characters. Check newer jobs before finalizing or acting on old approval.

If work is complete, record the result without inventing a new decision. If the premise changed or
work is blocked, replace the misleading card with the current facts and any meaningful next option.
Never add an Acknowledge/Keep blocked no-op. Keep actual in-flight checks Working until they finish.

## Push complete cards

Write one HTML file and a metadata JSON file in the configured app. The metadata requires
`project`, `category`, `headline`, `dedupeKey`, the four `rise` components, and `cardHtmlFile`
relative to the JSON file. Include `effortSeconds`, `effortReason`, `agentContext`, `sourceLabel`,
`sourceUrl` and `agentName` where useful. Run:

```sh
RADAR_URL=http://localhost:3100 npm run card:push -- path/to/card.json
```

The script reads the file and POSTs `cardHtml` to `/api/ideas`. HTML must be 80-250,000 characters;
private `agentContext` is limited to 100,000. Store enough exact sources, files, validation, prior
work and action scope to continue without asking the user to retell the task. Keep private evidence
out of outgoing messages and public artifacts; use only the useful private excerpt on local cards.

Ordinary upsert retains ID, increments version, replaces content/metadata and returns the card to
New with a fresh timestamp. It does not enforce `expectedVersion`. Coordinate writes and reread
before replacement; do not use it for a cosmetic update that reopens completed or skipped work.
Use a supported state-preserving presentation path when available, otherwise keep that redesign
private. Never edit approval text during a presentation-only change.

For a blocked replacement, first finish the latest job as failed/blocked. Then push the same
`dedupeKey`, actual `blockedJobId`, current `expectedVersion`, a visible
`data-radar-state="blocked"` element and no Do action. This guarded update preserves status,
score, ordering and job outcome. On 409, reread; do not guess a new version or replay approval.
New Task snapshots may omit version, so retrieve the current card first.

## HTML and controls

Use standalone HTML/CSS and local assets. No scripts, event handlers, iframes, forms, object/embed,
meta/base/link, inline svg/math, anchor tags, remote fonts, remote media or automatic external
requests. For navigation use an Open button; for SVG use a local image file.

- `data-radar-action="do"` plus `data-radar-prompt`: queues the exact shown action.
- `data-radar-action="open"` plus `data-radar-url`: view-only HTTP(S) link, with a visible ↗.
- No card-level Change, Improve or Skip. The host owns those controls and the feedback field.

Decision-ready cards need at least one meaningful Do action at the actual boundary. A blocked card
may have no action under the guarded exception above. A clicked card goes Working while the user
continues through New. Preserve selected ID across new cards, resorting and replacement; update its
content directly and retain feedback/expanded details. Do not alter host sort to move attention.

## Score, effort and topics

The API stores `rise.reach`, `rise.impact`, `rise.strategicFit`, `rise.ease` from 0-25 and their
0-100 sum. The host displays Score = rounded `rise.impact / 2.5` (0-10), plus estimated Effort in
human decision seconds. Set impact to desired Score × 2.5 and estimate the other components honestly.
Do not paint another score inside the card. High impact needs proven benefit, not speculative reach.
Downscore single-source evidence; one strong reproduction does not prove a widespread problem.

`effortSeconds` is the actual predicted review burden; `effortReason` explains it. Count exact copy,
diff scope, video duration, risks and required external reading. The host may calibrate the displayed
estimate; the rising active-time counter is separate. Never substitute agent runtime for user effort.
Default UI sorting is displayed score, then stored total, then ID; the user may choose effort or
newest. Backend result order is not necessarily the user's current order.

`GET /api/topics` returns labels/hints/keywords. Reuse topics; for a genuinely new lane use
`POST /api/topics {label,hint,keywords}`. The first matching topic uses category prefix or headline
keywords; unmatched cards stay in All. Do not rename/delete the user's topics without approval.

Authoritative source paths in the configured checkout: `app/api/{agent-jobs,ideas,state,topics}`,
`lib/job-lifecycle.ts`, `lib/blocked-card.ts`, `lib/rise.ts`, `lib/card-focus.ts` and
`scripts/{push-card,sync-me}.mjs`. Use `lib/agency-card-design.mjs` when its components fit.

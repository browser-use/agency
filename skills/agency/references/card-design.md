# Shared design defaults

Read before creating or improving any card, communication draft or visual. These are the current
Agency product defaults chosen by its founder, including three-option replies. Apply them for
teammates too unless a current user explicitly requests a different presentation.

## First view

Make the subject, problem, observed impact, finished change, remaining risk and next action clear
without opening another page. Use these as private checks, not six numbered stages or six panels.

- Compact product/work label, concrete verb-first headline (roughly 5-12 words), one short impact
  sentence, a dominant artifact or mechanism graphic, then exact action buttons.
- Explain what the user and agent do before and after, plus the unchanged normal path when relevant.
  Names and IDs alone are not context. A PR number belongs on the action, not as the explanation.
- Aim for about 120 first-view words excluding the artifact. Put secondary evidence in one or two
  native expandable sections. Never collapse essential risk, the subject or the meaning of a choice.
- Name the actual recipient, customer, project or workflow on private cards. Quantify independent
  complaints and affected users only when proven. Separate observed incidents from potential scope.
- Show behavior exercised, not a test-count sales pitch. Keep technical logs and test results in
  private or expanded evidence. Expose failed gates when they affect the decision.

## Graphics and layout

Use one clear mechanism, real before/after screen, labeled comparison or timeline when it explains
more quickly than prose. Never invent a before state, paint paragraphs into images, add decorative
boxes or repeat the same fact in a diagram, caption and accordion.

Use strong type hierarchy, whitespace, alignment, high contrast and one useful accent. Avoid heavy
border grids, tiny hero images, excessive gradients and generic AI art. Keep the real message, diff
or video dominant. Follow the affected product's established design system; Browser Use artifacts
should match its website, typography and logo. When the user points to a better previous design,
find its actual worktree and reuse the implementation before approximating a screenshot.

Green means observed success; amber or grey means pending, unknown or untested. State that in words
as well as color. Never draw unsupported numbers. First frames must already be truthful when motion
is paused. Choose animation only to explain a relationship or change.

Use local SVG files under `public/agent-assets/<work>/` through `<img>`; inline SVG is rejected by
the feed. Compose a separate mobile asset through `<picture>` if scaling would make labels too small.
Use about 16px body text, 14px labels and at least 13px selectable diffs. Keep long code internally
scrollable, not the whole page. Inspect desktop, 390px and expanded details before pushing a visual
card. Obtain an independent visual critique when practical and fix an unclear story.

Keep the host feedback, Improve and Skip area consistent in height, with the work body scrollable.
Execution buttons belong inside the card footer; do not duplicate them in a host dock. Use one dark
primary action, except the three reply choices below. View-only controls use a quiet label and ↗.
An update must retain card identity, typed feedback and expanded details. Show the revised card
directly, without a "changed in the background" banner or making a new card steal selection.

For product UI, keep one primary start action, quiet rate rows and expandable billing details rather
than repeating Start Free/Add Credits/Talk to Us in several panels. Prefer compact searchable
filters and editable/removable criteria over large preset boxes and rows of obvious dropdowns.

## Messages: three useful choices

For every new or revised communication draft, show exactly three distinct, short, send-ready
alternatives. Vary the useful question or angle, not synonyms. Show all three complete texts together,
recommend one, and give each its own `Send option 1/2/3` button. Put the exact recipient, destination
and any CC above them. Collapse source history rather than the short alternatives.

Each button carries only its own exact text and applicable live-target/duplicate checks. Selecting
one approves that choice only. No extra generic Send button or second selection screen. A user who
already approved exact wording should not receive three new choices; execute that wording when its
gates still hold. "Don't send" means revise privately and send nothing. If blocked, retain the drafts
and show only a meaningful unblock action, or no action when none exists.

Read comparable sent messages and the full prior thread. Keep the user's vocabulary, fragments and
directness. Use no long em/en dashes in authored prose; use a period or ASCII hyphen. No filler,
generic praise, fake excitement, invented sales ask or competitor put-down. A useful question can be
the entire reply. Offer a benchmark or name a complementary tool only when it answers the real
question; never imply a test occurred when it did not.

Keep visible text, stored draft and button prompt identical. Preserve literal code, quotes, source
evidence and historical sent messages exactly. Follow the execution reference's live reply checks.

## PRs: make the diff readable here

Above the patch, explain the behavior change and the two or three lines that matter. Include an
expandable selectable current-head diff with SHA, paths, hunk headers, context and addition/deletion
totals. Soft red for removals, soft green for additions, muted context, distinct hunk headers and
literal +/- signs make it readable without relying on color alone. Escape it as HTML; do not replace
code with a screenshot. Keep filenames sticky where practical and avoid wrapping code.

For Agency-authored small/medium PRs, include the complete human-written diff. You may summarize
generated files, lockfiles and snapshots, but name every omitted file and its totals. For contributor
PRs, include every changed file and behavior-changing hunk. Explain why a large diff is needed and
what side effects were tested; split work when that makes a safer decision.

UI changes also need real before/after screenshots or a working preview. Binary changes need the
artifact, filename, dimensions, format and size change. Refresh the diff and proof after a head
change. An external PR link is optional navigation, not required reading. Never make an untested
branch look ready through polished visuals.

## Demos and final check

Record real product work. Make a familiar annoying task and its payoff apparent in the first 2-3
seconds, cut dead time and keep labels readable. Follow the requested length; for long-running
work, capture continuous source footage and show setup, progress, several outcomes and a clean
finish. Do not stretch screenshots, invent activity or reenact an unrecorded completed task. Use
the available demo skill when applicable. Review privacy, the real artifact and the post-ready cut.

Before pushing, ask: can someone explain the change, impact, evidence and next action after one view?
Preserve exact approvals, sources and full diffs during improvements. Lower estimated Effort only
when review is genuinely easier; visual polish does not prove a decision-time improvement.

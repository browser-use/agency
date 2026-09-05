# Agency layout

Editable defaults for card appearance and explanation style. This is a reference for the Agency
skill, not another skill. Setup and private overrides are in the
[README](https://github.com/browser-use/agency#customize-the-layout).

These are the existing Agency design defaults, moved from the main skill. New users start with
this picture-first style: large useful graphics, very short explanations, clear context and impact,
three short message options and expandable colorful diffs. Use these defaults without a setup
questionnaire. Alternative themes apply only when the user explicitly requests one.

## Explain at a glance

Assume the reader knows nothing about the ticket. Explain it as simply as to a five-year-old,
without baby talk: concrete names, everyday words, one idea at a time.
Use short three-to-five-word labels and sentences where natural. Add context when those would
be cryptic. Show who is affected, what is wrong, what changes and why it helps.

- Start with the exact subject and one short benefit line. Make the artifact or explanatory
  graphic dominant. Labels such as "Who gets stuck?", "What changes?" and "What you get" are
  useful when they clarify the story; they are not a mandatory row of boxes.
- Include the original message or useful excerpt. Put longer conversation, evidence and logs
  in expandable details. Keep important risk, uncertainty and action scope visible.
- Show the end result: a tested before/after screenshot, runnable preview, exact message or
  readable change diagram. Distinguish proposed outcomes from observed results.
- Name proven affected users or complaints separately from potential reach.

## Visual defaults

Use meaningful graphics and a few words instead of paragraphs in decorative boxes. Favor
whitespace, large readable type, aligned comparisons and one useful accent. Match the affected
product's visual system unless the user chooses a different private-card theme.

Try different bodies when they fit: annotated screenshots, before/after, a short animated
mechanism, a timeline or a conversation. Prefer the user's proven previous designs. Note the
style in private ticket context, compare feedback and decision times, and repeat what helps.

Use local SVG images for diagrams. Animation should explain what changes, not demand attention.
Make the still frame understandable, honor reduced motion and avoid endless loops. Follow the
README's HTML restrictions; inline SVG, scripts and remote media are not supported.

Check desktop, 390px, expanded details and real media. Keep text readable and avoid clipping.
Get independent visual critique when useful.

## Messages

By default, show three distinct, short, complete options together. Recommend one; label their
buttons "Message 1", "Message 2" and "Message 3", and state the recipient/channel beside them.
Keep the full exact text visible so the user can choose without opening another page.
The private card theme does not rewrite outgoing messages or public assets into that theme.

## PRs

Explain the behavior change above an expandable, selectable, colorful current-head diff.
Include SHA, paths, context, hunk headers and +/- totals. Use soft red/green plus literal signs.
Include the full human-written diff; identify omitted generated files and their totals.
UI changes need real before/after visual proof. The card should be enough to review the change
without opening GitHub.

## Demos

Show the problem and payoff in the first two or three seconds. Cut dead time, keep labels
readable and follow the requested length. Public demos use the product's visual identity;
a playful private-card theme does not change their branding.

## Stable controls

Style the card body. Keep the host's navigation, feedback and action behavior consistent,
with the work body scrollable. Do not add an update banner or duplicate host controls.
Show hover/focus hints only for keyboard shortcuts the host actually supports.
Keep action names understandable, even in a playful theme: "Send", "Merge" or "Post".

## Customize in plain language

The user can edit this file or describe a change to Agency. For example:

> Make my cards look like Pokémon cards. Big illustration, colored borders by topic,
> short descriptions. Keep actual impact and effort visible. Put evidence and diffs
> in expandable sections.

That is an example, not the default theme. When asked to change the layout, update the selected
local layout file and show one preview before applying a broad redesign. Keep preferences here
instead of duplicating them in `me.md`. Personal changes stay local unless sharing is requested.
Appearance can vary; the skill's evidence, action and scoring rules still apply.

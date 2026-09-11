# Agency layout

Make the choice obvious with as little reading as possible. The card contains everything needed to decide.

## Show, then explain

Start with the concrete problem in familiar words. Prefer “These lines disagree” over abstract labels. Use a large screenshot, diagram, comparison or demo when it explains the result. Use big icons and one- or two-word labels where clear. Keep useful context; cut sentences the picture already explains.

For a conflict, show the two short source excerpts together and highlight only the conflicting words. Put the exact replacement beside them. A small wording fix should already be written, not a request to prepare it.

For a reply, show the incoming message first, with its author and date. Summarize it briefly if long; keep the full message expandable. Show any existing answer that changes the decision and what the new reply adds. Then show the exact reply, sending account, recipients including CC, and channel or thread. Keep facts that could change the decision visible.

For private preparation, show the completed brief, finding, patch or demo. A small interview pack or existing-feature walkthrough need not wait for approval to be prepared. Label mockups, incomplete findings and untested changes accurately. Never invent a screenshot, result or root cause.

## Draw what matters

Choose the layout for the content: two phrases for a wording conflict, annotated screenshots for a bug, a timeline for a handoff, a real demonstration for a working feature. Use the user's actual screens and objects when authorized. Do not repeat the same panels on every card.

Make the result larger than the decoration. Use readable type, aligned edges and space between groups. Remove repeated headings, badges and nested boxes. A short message may need no picture. Icons and emojis must help recognition, not replace essential labels.

Put original SVG files in ignored `public/agent-assets/` and embed with `<img>` or `<picture>`; inline SVG and scripts are rejected. Rearrange diagrams for phones instead of shrinking labels. Animate only to explain a change; provide a useful still frame and respect reduced motion. Do not copy private design source or assets.

## Make the next click count

Put the main action immediately after what it approves. Name the outcome: “Send this reply”, “Apply this wording” or “Share this demo”. Avoid “Prepare the fix” when the fix is small enough to show now. Hidden instructions must match the visible choice.

More uncertainty means more meaningful choices, usually two or three. Recommend one and show each tradeoff. A limited trial or “Investigate deeper” can be useful after easy checks are done. Show trial cost, account and behavior before offering to start it. Each option needs its own action; a generic Approve cannot select between alternatives.

A substantial project can have a scoped Build action. A Merge needs the current-head diff: SHA, paths, context, totals and selectable additions/deletions. Name omitted generated files. UI merges need real before/after proof. Keep supporting evidence expandable; never replace the decision with a file link.

## Read it as the user

Inspect the actual card at desktop and 390px, including evidence and assets. Show the problem and useful result early. Cut text and padding before shrinking type. Keep the action close. The host owns navigation, feedback, Improve and Skip.

Give a reviewer only the card. Can they tell what happened, what changes and what each button does? Remove unnecessary words; repair missing context. Keep successful design features in the user's private layout without forcing every card into the same shape. Design feedback does not approve external actions.

# Agency layout

The user knows only what the card shows. Make the choice obvious with as little reading as possible.

## Start outside, then go deeper

Lead with the outcome: help a customer, promote a feature or decide on a sponsorship. Orient with a short path: `Cloud → Monitoring → [dashboard name]`. Use real names, not internal labels such as “scoped build.” Introduce people by role: “creator offering a sponsored video.” Name and link the actual source.

Read from broad to specific: outcome → who and where → problem → result → choice. This is a reading order, not five boxes. Use short, complete sentences: subject, verb, object. Replace jargon and vague claims such as “define success.” Explain the benefit and uncertainty without inventing impact.

Show essentials first. Named `<details>` sections such as “Read the email,” “See the fix” or “How it works” reveal exact artifacts, graphics and evidence. The closed card must make sense. Keep scope, recipients, cost and key uncertainty visible. Keep exact copy or diffs inside the card; links cannot replace them.

Use a large screenshot, diagram or demo. Big icons and short labels replace prose; keep context the picture cannot carry.

For a conflict, put two short source excerpts together and highlight only conflicting words. Show the exact replacement; write small fixes now.

For a reply, show the incoming message, author and date first. Summarize long messages; expand for full text. Show relevant existing answers and what the reply adds. Include the exact draft, sending account, recipients including CC, and channel or thread.

Show completed briefs, findings, patches and demos. Prepare small interview packs and feature walkthroughs before asking. Label mockups, incomplete findings and untested changes. Never invent screenshots, results or root causes.

## Draw what matters

Choose the layout for the content: two phrases for a conflict, a tree for context, a timeline for a handoff, or a real demonstration for a feature. Use original SVGs with large labels when they explain relationships more clearly. Use actual screens when authorized. Do not repeat the same panels on every card.

Make the result larger than decoration. Use readable type, aligned edges and space. Remove repeated headings, badges and nested boxes. Short messages may need no picture. Icons help recognition; keep essential labels.

Put original SVG files in ignored `public/agent-assets/` and embed with `<img>` or `<picture>`; inline SVG and scripts are rejected. Rearrange diagrams for phones instead of shrinking labels. Animate only to explain a change; provide a useful still frame and respect reduced motion. Do not copy private design source or assets.

## Make the next click count

Put the main action immediately after what it approves. Name the outcome: “Send this reply”, “Apply this wording” or “Share this demo”. Avoid “Prepare the fix” when the fix is small enough to show now. Hidden instructions must match the visible choice.

More uncertainty means more meaningful choices, usually two or three. Recommend one and show each tradeoff. A limited trial or “Investigate deeper” can be useful after easy checks are done. Show trial cost, account and behavior before offering to start it. Each option needs its own action; a generic Approve cannot select between alternatives.

A substantial project can have a scoped Build action. A Merge needs the current-head diff: SHA, paths, context, totals and selectable additions/deletions. Name omitted generated files. UI merges need real before/after proof. Keep supporting evidence expandable; never replace the decision with a file link.

## Read it as the user

Inspect the actual card at desktop and 390px with sections closed, then expanded. The first view should explain what this is about, why it matters and the proposed result. Cut text and padding before shrinking type. Keep the action close. The host owns navigation, feedback, Improve and Skip.

Give a reviewer only the card. Can they tell who is involved, where this happens, what improves and what each button does? Remove unnecessary words; repair missing context. Learn idea value and visual preferences separately. Keep successful design features in the user's private layout without forcing every card into the same shape. Design feedback does not approve external actions.

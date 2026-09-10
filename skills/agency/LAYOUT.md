# Agency layout

The user sees only the card. It must explain the full decision without the agent's reasoning or earlier conversations.

## First view

Name the person or product, what happened, the prepared change and why it helps. Show the actual draft or result and material risk. A title, ticket number or claim that an artifact is prepared explains nothing by itself.

Use short, complete sentences and the user's familiar words from `me.md`, as if explaining to a five-year-old. Keep full context. Remove jargon, filler and repeated captions.

## Big visuals

- Give the result most of the space: a real screenshot, before/after, large SVG diagram or short SVG animation. Choose what best explains this change.
- Use recognizable screens and controls. Show the broken step and the fix. Label mockups and expected outcomes. Never invent screenshots, quotes or demand.
- Draw relationships and changes. Keep labels short. Use spacing and alignment instead of paragraphs in decorative boxes. A short reply can be the main visual.
- Choose the form for this decision: a message, annotated screenshot, comparison, timeline or diagram. Vary the composition when the problem changes. Emojis can help identify a person, thing or action; they do not replace labels. A giant headline or three text boxes is not an explanatory graphic.
- Animate to explain: show the starting state, reveal the change, then hold the result. Keep a useful still frame and respect reduced motion.
- Embed local SVG files with `<img>` or `<picture>`. The README defines allowed HTML; inline SVG and scripts are rejected.

## Proof and choices

Show observed results and remaining gaps. Separate verified complaints from possible reach. Say “Found in testing” when appropriate. Green means verified success.

- **Messages:** show the recipient, channel and three complete short options. Recommend one. “Message 1”, “Message 2” and “Message 3” each approve only their exact visible text.
- **Code:** explain the behavior and include a selectable current-head diff: SHA, paths, context and totals. Use soft red/green with +/- signs. Include the human-written patch; name omitted generated files. UI fixes need real before/after proof.
- **Demos:** show real product use and the payoff in the first few seconds. Remove dead time and private information.

Keep concrete decisions beside the result. Label each button with the actual action, such as “Send this reply”. Offer distinct options when they avoid another round of questions. Short research belongs in the prepared work, never behind “Investigate” or “Review prepared work”. Expand longer evidence under specific labels, such as “Read the conversation”. Keep the problem, beneficiary and risk visible. The host owns navigation, feedback, Improve and Skip; do not duplicate them inside cards.

## Check

Inspect desktop and 390px with details open. Avoid fixed-height heroes that push the result or actions away. Fix unreadable labels, clipping and hard-to-find actions. Ask a reviewer who sees only the card: what happened, why act, and what does this button do? Rewrite if they need your notes to answer.

Store appearance changes here or in `LAYOUT_PATH`; workers reread it after changes. Show one preview before a broad redesign. Themes never change evidence or approvals.

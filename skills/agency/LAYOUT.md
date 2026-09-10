# Agency layout

The user sees only the card. It must explain the full decision without the agent's reasoning or earlier conversations.

## First view

Name the person or product, the problem, the prepared change and the benefit. Show the exact action and material risk. A ticket number alone explains nothing.

Use short, complete sentences and familiar words, as if explaining to a five-year-old. Keep full context. Remove jargon, filler and repeated captions.

## Big visuals

- Give the result most of the space: a real screenshot, before/after, large SVG diagram or short SVG animation. Choose what best explains this change.
- Use recognizable screens and controls. Show the broken step and the fix. Label mockups and expected outcomes. Never invent screenshots, quotes or demand.
- Draw relationships and changes. Keep labels short. Use spacing and alignment instead of paragraphs in decorative boxes. A short reply can be the main visual.
- Animate to explain: show the starting state, reveal the change, then hold the result. Keep a useful still frame and respect reduced motion.
- Embed local SVG files with `<img>` or `<picture>`. The README defines allowed HTML; inline SVG and scripts are rejected.

## Proof and choices

Show observed results and remaining gaps. Separate verified complaints from possible reach. Say “Found in testing” when appropriate. Green means verified success.

- **Messages:** show the recipient, channel and three complete short options. Recommend one. “Message 1”, “Message 2” and “Message 3” each approve only their exact visible text.
- **Code:** explain the behavior and include a selectable current-head diff: SHA, paths, context and totals. Use soft red/green with +/- signs. Include the human-written patch; name omitted generated files. UI fixes need real before/after proof.
- **Demos:** show real product use and the payoff in the first few seconds. Remove dead time and private information.

Keep decisions together. Expand longer evidence under specific labels, such as “Read the conversation”. Keep the problem, beneficiary and risk visible. Preserve host navigation, feedback, Improve and Skip.

## Check

Inspect desktop and 390px with details open. Fix unreadable labels, clipping and hard-to-find actions. Have a reviewer explain the card from its first view when useful.

Store appearance changes here or in `LAYOUT_PATH`; workers reread it after changes. Show one preview before a broad redesign. Themes never change evidence or approvals.

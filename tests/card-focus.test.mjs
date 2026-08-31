import assert from "node:assert/strict";
import test from "node:test";

import { cardDraftKey, cardHasChanged, keepSelectedCard, nextCardAfterRemoval } from "../lib/card-focus.ts";

test("incoming higher-scored cards never replace the selected card", () => {
  const selected = { id: 7, version: 2, status: "new", score: 60 };
  const incoming = { id: 8, version: 1, status: "new", score: 100 };
  assert.equal(keepSelectedCard(selected, [incoming, selected]), selected);
});

test("a replacement version does not replace the selected snapshot", () => {
  const selected = { id: 7, version: 2, status: "new" };
  const replacement = { id: 7, version: 3, status: "new" };
  assert.equal(keepSelectedCard(selected, [replacement]), selected);
  assert.equal(cardHasChanged(selected, replacement), true);
});

test("a card that leaves the lane cannot remain pinned", () => {
  const selected = { id: 7, version: 2, status: "new" };
  const next = { id: 8, version: 1, status: "new" };
  assert.equal(keepSelectedCard(selected, [next]), next);
});

test("an action advances to the following untouched card without jumping to the first", () => {
  const cards = [{ id: 10 }, { id: 20 }, { id: 30 }];
  assert.equal(nextCardAfterRemoval(20, cards), cards[2]);
  assert.equal(nextCardAfterRemoval(30, cards), cards[0]);
  assert.equal(nextCardAfterRemoval(10, cards), cards[1]);
  assert.equal(nextCardAfterRemoval(10, [cards[0]]), null);
});

test("feedback drafts are scoped to an exact card version", () => {
  assert.equal(cardDraftKey({ id: 7, version: 2, status: "new" }), "7:2");
  assert.notEqual(
    cardDraftKey({ id: 7, version: 2, status: "new" }),
    cardDraftKey({ id: 7, version: 3, status: "new" }),
  );
});

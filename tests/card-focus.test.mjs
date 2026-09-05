import assert from "node:assert/strict";
import test from "node:test";

import { cardDraftKey, keepSelectedCard, nextCardAfterRemoval } from "../lib/card-focus.ts";

test("incoming higher-scored cards never replace the selected card", () => {
  const selected = { id: 7, version: 2, status: "new", score: 60 };
  const incoming = { id: 8, version: 1, status: "new", score: 100 };
  assert.equal(keepSelectedCard(selected, [incoming, selected]), selected);
});

test("a replacement version appears immediately without changing the selected ID", () => {
  const selected = { id: 7, version: 2, status: "new" };
  const replacement = { id: 7, version: 3, status: "new" };
  assert.equal(keepSelectedCard(selected, [replacement]), replacement);
});

test("polling refreshes the selected card even when its status changes", () => {
  const selected = { id: 7, version: 2, status: "new" };
  const updated = { id: 7, version: 3, status: "working" };
  const other = { id: 8, version: 1, status: "new" };
  assert.equal(keepSelectedCard(selected, [other], [other, updated]), updated);
});

test("polling keeps the selected card pinned even if it leaves the lane", () => {
  const selected = { id: 7, version: 2, status: "new" };
  const next = { id: 8, version: 1, status: "new" };
  assert.equal(keepSelectedCard(selected, [next]), selected);
});

test("an action advances to the following untouched card without jumping to the first", () => {
  const cards = [{ id: 10 }, { id: 20 }, { id: 30 }];
  assert.equal(nextCardAfterRemoval(20, cards), cards[2]);
  assert.equal(nextCardAfterRemoval(30, cards), cards[0]);
  assert.equal(nextCardAfterRemoval(10, cards), cards[1]);
  assert.equal(nextCardAfterRemoval(10, [cards[0]]), null);
});

test("feedback stays on the same card across live revisions", () => {
  assert.equal(cardDraftKey({ id: 7, version: 2, status: "new" }), "7");
  assert.equal(
    cardDraftKey({ id: 7, version: 2, status: "new" }),
    cardDraftKey({ id: 7, version: 3, status: "new" }),
  );
  assert.notEqual(cardDraftKey({ id: 7 }), cardDraftKey({ id: 8 }));
});

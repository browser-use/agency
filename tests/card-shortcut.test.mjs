import assert from "node:assert/strict";
import test from "node:test";

import { cardShortcut } from "../lib/card-shortcut.ts";

test("maps card shortcuts", () => {
  assert.equal(cardShortcut({ key: "s", editable: false }), "skip");
  assert.equal(cardShortcut({ key: "S", editable: false }), "skip");
  assert.equal(cardShortcut({ key: "i", editable: false }), "improve");
  assert.equal(cardShortcut({ key: "I", editable: false }), "improve");
  assert.equal(cardShortcut({ key: "ArrowLeft", editable: false }), "previous");
  assert.equal(cardShortcut({ key: "ArrowRight", editable: false }), "next");
});

test("does not fire while typing or using a modified shortcut", () => {
  assert.equal(cardShortcut({ key: "s", editable: true }), null);
  assert.equal(cardShortcut({ key: "i", editable: true }), null);
  assert.equal(cardShortcut({ key: "ArrowLeft", editable: true }), null);
  assert.equal(cardShortcut({ key: "ArrowRight", editable: true }), null);
  assert.equal(cardShortcut({ key: "s", editable: false, repeat: true }), null);
  assert.equal(cardShortcut({ key: "i", editable: false, composing: true }), null);
  assert.equal(cardShortcut({ key: "s", editable: false, metaKey: true }), null);
  assert.equal(cardShortcut({ key: "i", editable: false, ctrlKey: true }), null);
  assert.equal(cardShortcut({ key: "x", editable: false }), null);
});

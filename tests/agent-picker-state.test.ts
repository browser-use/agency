import assert from "node:assert/strict";
import test from "node:test";
import {
  cardAgentDraftState,
  discardCardAgentDraft,
  finishCardAgentDraftSave,
  reapplyCardAgentDraft,
  selectionCanRun,
  selectionCanStartWork,
  selectionValidity,
  thinkingLevelOptions,
  updateCardAgentDraft,
} from "../app/components/agent-picker-state.ts";
import type { AgentModel, AgentSelection } from "../lib/agent-models.ts";

const model: AgentModel = {
  id: "fixture/model",
  runner: "fixture",
  model: "fixture-model",
  label: "Fixture model",
  thinkingLevels: ["medium"],
  defaultThinkingLevel: "medium",
};
const savedSelection: AgentSelection = { modelId: model.id, thinkingLevel: "medium" };

test("empty catalogs remain legacy-compatible only without a persisted effective selection", () => {
  assert.equal(selectionCanRun([], null), true);
  assert.equal(selectionCanRun([], savedSelection), false);
  assert.equal(selectionCanRun([model], savedSelection), true);
});

test("model-dependent work stays blocked until an authoritative settings refresh applies", () => {
  assert.equal(selectionCanStartWork([model], savedSelection, false), true);
  assert.equal(selectionCanStartWork([model], savedSelection, true), false);
});

test("a removed thinking level remains visible and cannot silently fall back", () => {
  const selection = { modelId: model.id, thinkingLevel: "high" };
  const options = thinkingLevelOptions(model, selection, null);
  assert.deepEqual(options, [
    { value: "high", label: "high (unavailable)" },
    { value: "medium", label: "medium" },
  ]);
  assert.equal(selectionValidity([model], selection).valid, false);
  assert.equal(selectionCanStartWork([model], selection, false), false);
  assert.deepEqual(thinkingLevelOptions(undefined, selection, null), [options[0]]);
  assert.deepEqual(thinkingLevelOptions(model, savedSelection, null), [{ value: "medium", label: "medium" }]);
  assert.deepEqual(thinkingLevelOptions(undefined, null, savedSelection), [{ value: "medium", label: "From default · medium" }]);
});

const card = { id: 16, version: 1, agentRevision: 0, agentSelection: null };
const otherSelection = { modelId: "fixture/other-model", thinkingLevel: "low" };

test("polls preserve unsaved model choices by card identity and block stale work", () => {
  const drafts = updateCardAgentDraft({}, card, savedSelection);
  const refreshed = { ...card, agentRevision: 1, agentSelection: otherSelection };
  const state = cardAgentDraftState(refreshed, drafts);
  assert.deepEqual(state.selection, savedSelection);
  assert.equal(state.stale, true);
  assert.equal(state.dirty, true);
  assert.equal(state.blocksWork, true);
  assert.equal(state.draft.expectedAgentRevision, 0);
  assert.equal(state.draft.expectedVersion, 1);

  const changedAgain = updateCardAgentDraft(drafts, refreshed, null);
  assert.equal(changedAgain[card.id].expectedAgentRevision, 0);
  assert.equal(cardAgentDraftState(refreshed, changedAgain).stale, true);

  // Another editor choosing the same value is still a conflict that needs an
  // explicit acknowledgement, not a reason to erase this draft during a poll.
  const matching = { ...refreshed, agentSelection: savedSelection };
  assert.equal(cardAgentDraftState(matching, drafts).dirty, false);
  assert.equal(cardAgentDraftState(matching, drafts).blocksWork, true);
  assert.equal(cardAgentDraftState(matching, updateCardAgentDraft(drafts, matching, savedSelection)).stale, true);
});

test("a card content revision also requires review before applying a model draft", () => {
  const drafts = updateCardAgentDraft({}, card, savedSelection);
  const revised = { ...card, version: 2 };
  assert.equal(cardAgentDraftState(revised, drafts).stale, true);
  const reapplied = reapplyCardAgentDraft(drafts, revised);
  assert.equal(reapplied[card.id].expectedVersion, 2);
  assert.equal(cardAgentDraftState(revised, reapplied).stale, false);
  assert.equal(cardAgentDraftState(revised, reapplied).blocksWork, true);
});

test("discard and intentional reapply resolve conflicts without overwriting another card's draft", () => {
  const otherCard = { ...card, id: 17 };
  let drafts = updateCardAgentDraft({}, card, savedSelection);
  drafts = updateCardAgentDraft(drafts, otherCard, otherSelection);
  const refreshed = { ...card, agentRevision: 4, agentSelection: otherSelection };
  assert.deepEqual(cardAgentDraftState(otherCard, drafts).selection, otherSelection);

  const reapplied = reapplyCardAgentDraft(drafts, refreshed);
  const state = cardAgentDraftState(refreshed, reapplied);
  assert.equal(state.stale, false);
  assert.equal(state.dirty, true);
  assert.equal(state.blocksWork, true, "reapplying still requires an explicit successful save");
  assert.equal(state.draft.expectedAgentRevision, 4);
  assert.deepEqual(state.selection, savedSelection);
  assert.equal(reapplied[otherCard.id], drafts[otherCard.id]);

  const discarded = discardCardAgentDraft(drafts, card.id);
  assert.deepEqual(cardAgentDraftState(refreshed, discarded).selection, otherSelection);
  assert.equal(cardAgentDraftState(refreshed, discarded).blocksWork, false);
  assert.equal(discarded[otherCard.id], drafts[otherCard.id]);
});

test("an acknowledged save clears only its own draft while refreshed settings still gate actions", () => {
  const otherCard = { ...card, id: 17 };
  let drafts = updateCardAgentDraft({}, card, savedSelection);
  const submitted = drafts[card.id];
  drafts = updateCardAgentDraft(drafts, otherCard, otherSelection);
  const savedCard = { ...card, agentRevision: 1, agentSelection: savedSelection };
  const finished = finishCardAgentDraftSave(drafts, card.id, submitted);
  assert.equal(cardAgentDraftState(savedCard, finished).blocksWork, false);
  assert.equal(finished[otherCard.id], drafts[otherCard.id]);
  assert.equal(selectionCanStartWork([model], savedSelection, true), false);

  const editedAgain = updateCardAgentDraft(drafts, card, otherSelection);
  assert.equal(finishCardAgentDraftSave(editedAgain, card.id, submitted), editedAgain);
  assert.deepEqual(cardAgentDraftState(savedCard, editedAgain).selection, otherSelection);
  assert.equal(cardAgentDraftState(savedCard, editedAgain).stale, true);
});

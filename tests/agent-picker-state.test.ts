import assert from "node:assert/strict";
import test from "node:test";
import { selectionCanRun, selectionCanStartWork } from "../app/components/agent-picker-state.ts";
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

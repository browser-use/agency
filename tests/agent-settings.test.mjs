import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { getAgentSettings, saveAgentCatalog } from "../lib/agent-settings.ts";

const models = [{
  id: "codex/fixture", runner: "codex", model: "fixture", label: "Fixture",
  thinkingLevels: ["low", "high"], defaultThinkingLevel: "low",
}];
const runnerDefault = { modelId: "codex/fixture", thinkingLevel: "low" };

function createDatabase(t) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec(`CREATE TABLE agent_settings (
    id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL DEFAULT 0,
    models TEXT NOT NULL DEFAULT '[]', runner_default TEXT, discovery TEXT, execution TEXT
  )`);
  sqlite.prepare(`INSERT INTO agent_settings
    (id, revision, models, runner_default, discovery, execution) VALUES (1, 7, ?, ?, ?, ?)`)
    .run(JSON.stringify(models), JSON.stringify(runnerDefault), JSON.stringify(runnerDefault), null);
  return {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      const bound = (values) => ({
        async first() { return statement.get(...values) ?? null; },
      });
      return { ...bound([]), bind: (...values) => bound(values) };
    },
  };
}

test("a matching catalog at the current revision succeeds without increasing the revision", async (t) => {
  const db = createDatabase(t);
  const before = await getAgentSettings(db);
  assert.deepEqual(await saveAgentCatalog(db, models, runnerDefault, 7), before);
  assert.deepEqual(await getAgentSettings(db), before);
});

test("a stale catalog revision conflicts even when the submitted content matches", async (t) => {
  const db = createDatabase(t);
  const before = await getAgentSettings(db);
  assert.equal(await saveAgentCatalog(db, models, runnerDefault, 6), null);
  assert.deepEqual(await getAgentSettings(db), before);
});

test("a stale catalog revision cannot change the catalog or runner default", async (t) => {
  const db = createDatabase(t);
  const before = await getAgentSettings(db);
  assert.equal(await saveAgentCatalog(db, [{ ...models[0], label: "Changed" }], {
    ...runnerDefault, thinkingLevel: "high",
  }, 6), null);
  assert.deepEqual(await getAgentSettings(db), before);
});

test("a valid catalog update increments once and preserves discovery and execution defaults", async (t) => {
  const db = createDatabase(t);
  const updatedModels = [{ ...models[0], label: "Changed" }];
  const updatedDefault = { ...runnerDefault, thinkingLevel: "high" };
  const saved = await saveAgentCatalog(db, updatedModels, updatedDefault, 7);
  assert.deepEqual(saved, {
    revision: 8, models: updatedModels, runnerDefault: updatedDefault,
    discovery: runnerDefault, execution: null,
  });
  assert.deepEqual(await getAgentSettings(db), saved);
  assert.deepEqual(await saveAgentCatalog(db, updatedModels, updatedDefault, 8), saved);
});

test("catalog updates without an expected revision retain idempotent refresh behavior", async (t) => {
  const db = createDatabase(t);
  assert.equal((await saveAgentCatalog(db, models, runnerDefault)).revision, 7);
  const saved = await saveAgentCatalog(db, models, null);
  assert.equal(saved.revision, 8);
  assert.equal(saved.runnerDefault, null);
  assert.deepEqual(await saveAgentCatalog(db, models, null), saved);
});

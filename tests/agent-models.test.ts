import assert from "node:assert/strict";
import test from "node:test";
import {
  AgentInputError,
  agentRunMatchesConfig,
  expectedRevisionMatches,
  parseAgentCatalog,
  parseAgentRun,
  parseStoredAgentConfig,
  parseStoredSelectionOrThrow,
  readJsonObject,
  resolveAgentConfig,
  validateAgentSelection,
  type AgentModel,
  type AgentSettings,
} from "../lib/agent-models.ts";

const codex: AgentModel = {
  id: "codex:gpt-6-astra",
  runner: "codex",
  model: "gpt-6-astra",
  label: "GPT-6 Astra",
  thinkingLevels: ["low", "medium", "high"],
  defaultThinkingLevel: "medium",
};

const claude: AgentModel = {
  id: "claude:opus-5.1",
  runner: "claude",
  model: "opus-5.1",
  label: "Claude Opus 5.1",
  thinkingLevels: ["medium", "high"],
  defaultThinkingLevel: "high",
};

function settings(overrides: Partial<AgentSettings> = {}): AgentSettings {
  return {
    revision: 7,
    models: [codex, claude],
    runnerDefault: { modelId: codex.id, thinkingLevel: "medium" },
    discovery: { modelId: claude.id, thinkingLevel: "high" },
    execution: { modelId: codex.id, thinkingLevel: "high" },
    ...overrides,
  };
}

test("catalog validation rejects duplicate identities and unsupported defaults", () => {
  assert.throws(() => parseAgentCatalog([codex, { ...codex, id: "another-id" }]), /identities must be unique/);
  assert.throws(() => parseAgentCatalog([{ ...codex, defaultThinkingLevel: "ultra" }]), /must be supported/);
  assert.throws(() => parseAgentCatalog([{ ...codex, thinkingLevels: ["high", "high"] }]), /duplicates/);
});

test("selection validation rejects unavailable models and unsupported efforts", () => {
  assert.throws(
    () => validateAgentSelection({ modelId: "missing", thinkingLevel: "high" }, [codex]),
    /unavailable model/,
  );
  assert.throws(
    () => validateAgentSelection({ modelId: codex.id, thinkingLevel: "ultra" }, [codex]),
    /unsupported thinking level/,
  );
});

test("discovery and execution resolve from separate saved profiles", () => {
  const discovery = resolveAgentConfig(settings(), "discovery");
  const execution = resolveAgentConfig(settings(), "execution");
  assert.equal(discovery?.modelId, claude.id);
  assert.equal(discovery?.source, "discovery-default");
  assert.equal(execution?.modelId, codex.id);
  assert.equal(execution?.thinkingLevel, "high");
  assert.equal(execution?.source, "execution-default");
});

test("card override wins and records the exact settings and card revisions", () => {
  const config = resolveAgentConfig(
    settings({ revision: 11 }),
    "execution",
    { modelId: claude.id, thinkingLevel: "medium" },
    4,
  );
  assert.deepEqual(config, {
    modelId: claude.id,
    runner: "claude",
    model: "opus-5.1",
    thinkingLevel: "medium",
    contextMode: "fresh",
    phase: "execution",
    source: "card",
    settingsRevision: 11,
    cardRevision: 4,
  });
});

test("null profile uses runner default while a completely empty catalog remains legacy-compatible", () => {
  const fallback = resolveAgentConfig(settings({ execution: null }), "execution");
  assert.equal(fallback?.source, "runner-default");
  assert.equal(fallback?.thinkingLevel, "medium");
  assert.equal(resolveAgentConfig(settings({ models: [], runnerDefault: null, discovery: null, execution: null }), "execution"), null);
});

test("clearing a catalog does not silently fall back past a persisted selection", () => {
  assert.throws(
    () => resolveAgentConfig(settings({ models: [] }), "execution"),
    (error: unknown) => error instanceof AgentInputError && /unavailable model/.test(error.message),
  );
  assert.throws(
    () => resolveAgentConfig(
      settings({ models: [], runnerDefault: null, discovery: null, execution: null }),
      "execution",
      { modelId: codex.id, thinkingLevel: "high" },
    ),
    /unavailable model/,
  );
});

test("a queued config snapshot stays unchanged after settings change", () => {
  const queued = resolveAgentConfig(settings(), "execution", null, 2);
  const stored = JSON.stringify(queued);
  const changed = settings({
    revision: 8,
    execution: { modelId: claude.id, thinkingLevel: "medium" },
  });
  const prospective = resolveAgentConfig(changed, "execution", null, 2);
  assert.equal(parseStoredAgentConfig(stored)?.modelId, codex.id);
  assert.equal(parseStoredAgentConfig(stored)?.settingsRevision, 7);
  assert.equal(prospective?.modelId, claude.id);
  assert.equal(prospective?.settingsRevision, 8);
});

test("stale revisions fail while omitted revisions remain backward-compatible", () => {
  assert.equal(expectedRevisionMatches(5, 6), false);
  assert.equal(expectedRevisionMatches(6, 6), true);
  assert.equal(expectedRevisionMatches(undefined, 6), true);
});

test("worker claims must match runner, model, effort, and fresh context", () => {
  const config = resolveAgentConfig(settings(), "execution")!;
  assert.equal(agentRunMatchesConfig({
    runner: config.runner,
    model: config.model,
    thinkingLevel: config.thinkingLevel,
    contextMode: "fresh",
    workerId: "worker-1",
  }, config), true);
  assert.equal(agentRunMatchesConfig({ ...config, model: "wrong-model" }, config), false);
  assert.equal(agentRunMatchesConfig({ ...config, thinkingLevel: "low" }, config), false);
  assert.throws(() => parseAgentRun({ ...config, contextMode: "inherited" }), /must be fresh/);
});

test("malformed request JSON and non-object JSON produce input errors", async () => {
  await assert.rejects(
    () => readJsonObject(new Request("http://localhost/api", { method: "POST", body: "{" })),
    /valid JSON/,
  );
  await assert.rejects(
    () => readJsonObject(new Request("http://localhost/api", { method: "POST", body: "null" })),
    /JSON object/,
  );
});

test("malformed persisted selections and job configs fail closed", () => {
  assert.throws(() => parseStoredSelectionOrThrow('{"modelId":1}'), /invalid/);
  assert.equal(parseStoredAgentConfig(JSON.stringify({
    modelId: codex.id,
    runner: "",
    model: codex.model,
    thinkingLevel: "high",
    contextMode: "fresh",
    phase: "execution",
    source: "card",
    settingsRevision: 1,
    cardRevision: 1,
  })), null);
});

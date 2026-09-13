import test from "node:test";
import assert from "node:assert/strict";
import { buildDispatch } from "../scripts/agent-dispatch.mjs";

const config = { modelId: "codex/fixture", runner: "codex", model: "fixture", thinkingLevel: "low", contextMode: "fresh", phase: "execution", source: "card", settingsRevision: 2, cardRevision: 1 };

test("dispatch uses the queued job snapshot and fresh context, not parent defaults", () => {
  const job = { id: 42, instruction: "Verify the local fixture", history: [{ result: "Prior check completed" }], agentConfig: config };
  const result = buildDispatch(job.agentConfig, "Work only on the isolated fixture.", job);
  assert.equal(result.spawnAgent.model, "fixture");
  assert.equal(result.spawnAgent.reasoning_effort, "low");
  assert.equal(result.spawnAgent.fork_turns, "none");
  assert.match(result.spawnAgent.message, /Prior check completed/);
  assert.match(result.spawnAgent.message, /Verify the local fixture/);
  assert.match(result.spawnAgent.message, /Wait for the coordinator/);
  assert.deepEqual(result.claim.agentRun, { runner: "codex", model: "fixture", thinkingLevel: "low", contextMode: "fresh" });
});

test("successive discovery waves and job retries create distinct fresh worker names", () => {
  assert.notEqual(buildDispatch(config, "Brief").spawnAgent.task_name, buildDispatch(config, "Brief").spawnAgent.task_name);
  const job = { id: 42 };
  const first = buildDispatch(config, "Brief", job).spawnAgent.task_name;
  const retry = buildDispatch(config, "Brief", job).spawnAgent.task_name;
  assert.notEqual(first, retry);
  assert.match(first, /^agency_job_42_[a-f0-9]+$/);
});

test("discovery profile produces a fresh worker without an execution claim", () => {
  const result = buildDispatch({ ...config, model: "discovery-fixture", thinkingLevel: "medium", phase: "discovery", source: "discovery-default" }, "Read only the marked project.");
  assert.equal(result.spawnAgent.model, "discovery-fixture");
  assert.equal(result.spawnAgent.reasoning_effort, "medium");
  assert.equal(result.claim, undefined);
  assert.match(result.spawnAgent.message, /does not approve sending/);
});

test("missing configuration, unsupported runners and inherited contexts never silently fall back", () => {
  assert.throws(() => buildDispatch(null, "Brief"), /No worker model/);
  assert.throws(() => buildDispatch({ ...config, runner: "other" }, "Brief"), /supports Codex/);
  assert.throws(() => buildDispatch({ ...config, contextMode: "inherit" }, "Brief"), /fresh context/);
  assert.throws(() => buildDispatch(config, ""), /self-contained/);
});

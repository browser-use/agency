import test from "node:test";
import assert from "node:assert/strict";
import { agencyUrl } from "../../scripts/lib/agency-client.mjs";

const target = process.env.AGENCY_TEST_URL;
const models = [
  { id: "test/quick", runner: "codex", model: "fixture-quick", label: "Fixture quick", thinkingLevels: ["low", "medium"], defaultThinkingLevel: "low" },
  { id: "test/deep", runner: "codex", model: "fixture-deep", label: "Fixture deep", thinkingLevels: ["high"], defaultThinkingLevel: "high" },
];
const quick = { modelId: "test/quick", thinkingLevel: "low" };
const deep = { modelId: "test/deep", thinkingLevel: "high" };

test("model routing through the real local D1 API", { skip: !target }, async (t) => {
  const base = agencyUrl(target);
  assert.notEqual(new URL(base).port, "3100", "Use a separate fixture server, not your everyday Agency queue.");
  const ids = new Set(); const jobs = new Map();
  async function request(path, body, expected = 200, extraHeaders = {}) {
    const response = await fetch(`${base}${path}`, { method: body === undefined ? "GET" : "POST", headers: { "x-radar-local-agent": "1", "content-type": "application/json", ...extraHeaders }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "error" });
    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch { data = { error: text }; }
    assert.equal(response.status, expected, `${path}: ${JSON.stringify(data)}`);
    return data;
  }
  const original = await request("/api/agent-settings");
  const originalState = await request("/api/state?light=1");
  const fixtureProfile = "Local model-routing preview only. Use fictional fixtures to test model defaults and per-card overrides. Do not access clients or send messages.";
  assert.ok(originalState.context === null || originalState.context.text === fixtureProfile, "Fixture tests require a separate database without a personal profile.");
  async function settings() { return request("/api/agent-settings"); }
  async function catalog(list = models, runnerDefault = quick) {
    await request("/api/agent-models", { models: list, runnerDefault, expectedRevision: (await settings()).revision });
  }
  async function profiles(discovery = quick, execution = deep) {
    return request("/api/agent-settings", { expectedRevision: (await settings()).revision, discovery, execution });
  }
  async function card(id) {
    const value = (await request(`/api/state?only=${id}&card=${id}`)).ideas.find((item) => item.id === id);
    assert.ok(value); return value;
  }
  async function newCard() {
    const created = await request("/api/ideas", { project: "Model routing fixture", category: "Local tests", headline: "Verify the selected worker", dedupeKey: `model-routing-fixture:${crypto.randomUUID()}`, rise: { reach: 1, impact: 1, strategicFit: 1, ease: 1 }, cardHtml: '<article><h1>Model routing fixture</h1><p>Read only the marked local fixture. No external action.</p><button data-radar-action="do" data-radar-prompt="Read the local fixture only.">Verify fixture</button></article>' }, 201);
    ids.add(created.idea.id); return card(created.idea.id);
  }
  async function override(value, selection, expected = 200) {
    return request("/api/ideas/agent", { id: value.id, version: value.version, expectedAgentRevision: value.agentRevision, selection }, expected);
  }
  async function queue(value, expected = 200, overrides = {}) {
    const response = await request("/api/ideas/action", { id: value.id, version: value.version, status: value.status, action: "do", label: "Verify fixture", prompt: "Read only the marked local fixture.", expectedAgentRevision: value.agentRevision, expectedSettingsRevision: (await settings()).revision, ...overrides }, expected);
    if (response.jobId && expected === 200) jobs.set(response.jobId, null);
    return response;
  }
  async function queued(id) { const value = (await request("/api/agent-jobs")).jobs.find((item) => item.id === id); assert.ok(value); jobs.set(id, value.agentConfig); return value; }
  const runFor = (config) => ({ runner: config.runner, model: config.model, thinkingLevel: config.thinkingLevel, contextMode: "fresh", workerId: "local-api-fixture" });
  async function finish(id, config) {
    await request("/api/agent-jobs", { id, status: "running", ...(config ? { agentRun: runFor(config) } : {}) });
    await request("/api/agent-jobs", { id, status: "done", ticketOutcome: "review", result: "Synthetic API routing test verified. No model inference or external action was performed." });
    jobs.delete(id);
  }
  try {
    await catalog();
    const saved = await profiles();
    await t.test("defaults persist independently; invalid and stale settings are rejected", async () => {
      assert.deepEqual((await settings()).discovery, quick); assert.deepEqual((await settings()).execution, deep);
      await request("/api/agent-settings", { expectedRevision: saved.revision - 1, discovery: null, execution: null }, 409);
      await request("/api/agent-settings", { expectedRevision: saved.revision, discovery: quick, execution: { ...deep, thinkingLevel: "low" } }, 400);
      await request("/api/agent-settings", null, 400);
      await request("/api/agent-settings", { expectedRevision: saved.revision, discovery: quick, execution: deep }, 403, { origin: "https://outside.example" });
    });
    const initial = await newCard();
    await t.test("card overrides persist without changing content, order or lane", async () => {
      await override(initial, { ...quick, thinkingLevel: "medium" });
      const current = await card(initial.id);
      assert.equal(current.version, initial.version); assert.equal(current.createdAt, initial.createdAt); assert.equal(current.status, "new");
      assert.equal(current.agentRevision, initial.agentRevision + 1); assert.equal(current.agentConfig.thinkingLevel, "medium");
      await override(initial, deep, 409);
      await override(current, { ...deep, thinkingLevel: "low" }, 400);
    });
    await t.test("stale approval cannot enqueue the wrong profile", async () => {
      const current = await card(initial.id);
      await queue(current, 409, { expectedSettingsRevision: saved.revision - 1 });
      await queue(current, 409, { expectedAgentRevision: initial.agentRevision });
    });
    await t.test("queued config is immutable and mismatched or inherited claims fail", async () => {
      const current = await card(initial.id); const { jobId } = await queue(current);
      const before = await queued(jobId); assert.equal(before.agentConfig.model, "fixture-quick"); assert.equal(before.agentConfig.thinkingLevel, "medium");
      await profiles(deep, quick);
      assert.deepEqual((await queued(jobId)).agentConfig, before.agentConfig);
      await override(current, deep, 409);
      await request("/api/agent-jobs", { id: jobId, status: "running" }, 409);
      await request("/api/agent-jobs", { id: jobId, status: "running", agentRun: { ...runFor(before.agentConfig), model: "fixture-deep" } }, 409);
      await request("/api/agent-jobs", { id: jobId, status: "running", agentRun: { ...runFor(before.agentConfig), thinkingLevel: "low" } }, 409);
      const inherited = await fetch(`${base}/api/agent-jobs`, { method: "POST", headers: { "x-radar-local-agent": "1", "content-type": "application/json" }, body: JSON.stringify({ id: jobId, status: "running", agentRun: { ...runFor(before.agentConfig), contextMode: "inherit" } }) });
      assert.ok([400, 409].includes(inherited.status));
      await request("/api/agent-jobs", { id: jobId, status: "running", agentRun: runFor(before.agentConfig) });
      assert.equal((await card(current.id)).agentRun.model, "fixture-quick");
      await finish(jobId, before.agentConfig);
    });
    await t.test("resetting a card inherits the next execution default", async () => {
      const current = await card(initial.id); await override(current, null);
      const next = await card(initial.id);
      assert.deepEqual(next.agentConfig, current.agentConfig, "Retain the previous run separately from the next selection");
      assert.equal(next.agentSelection, null);
      const { jobId } = await queue(next); const job = await queued(jobId);
      assert.equal(job.agentConfig.source, "execution-default"); assert.equal(job.agentConfig.thinkingLevel, "low");
      await finish(jobId, job.agentConfig);
    });
    await t.test("New Task snapshots its override and rejects stale defaults", async () => {
      const revision = (await settings()).revision;
      await request("/api/tasks", { task: "Model routing fixture only", agentSelection: deep, expectedSettingsRevision: revision - 1 }, 409);
      const created = await request("/api/tasks", { task: "Model routing fixture only", agentSelection: deep, expectedSettingsRevision: revision }, 201);
      ids.add(created.ideaId); jobs.set(created.jobId, null); const job = await queued(created.jobId);
      assert.equal(job.agentConfig.source, "card"); assert.equal(job.agentConfig.model, "fixture-deep"); await finish(job.id, job.agentConfig);
    });
    await t.test("removing the catalog cannot silently bypass an explicit saved choice", async () => {
      const fresh = await newCard(); await override(fresh, deep); await catalog([], null);
      try {
        await queue(await card(fresh.id), 409);
        assert.deepEqual((await settings()).execution, quick);
      } finally { await catalog(); }
    });
    await t.test("concurrent card edits admit one revision winner", async () => {
      const fresh = await newCard();
      const requests = [quick, deep].map((selection) => fetch(`${base}/api/ideas/agent`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ id: fresh.id, version: fresh.version, expectedAgentRevision: fresh.agentRevision, selection }) }));
      const statuses = (await Promise.all(requests)).map((response) => response.status).sort();
      assert.deepEqual(statuses, [200, 409]);
    });
    await t.test("an unavailable worker can be blocked truthfully before launch", async () => {
      const fresh = await newCard(); const { jobId } = await queue(fresh); const job = await queued(jobId);
      await request("/api/agent-jobs", { id: jobId, status: "done", ticketOutcome: "completed", result: "Not started" }, 409);
      await request("/api/agent-jobs", { id: jobId, status: "failed", ticketOutcome: "blocked", failureStage: "dispatch", result: "" }, 400);
      await request("/api/agent-jobs", { id: jobId, status: "failed", ticketOutcome: "blocked", failureStage: "dispatch", result: "Runner unavailable", agentRun: runFor(job.agentConfig) }, 400);
      await request("/api/agent-jobs", { id: jobId, status: "failed", ticketOutcome: "blocked", failureStage: "dispatch", result: "The selected runner is unavailable; no worker was started." });
      jobs.delete(jobId);
      const blocked = await card(fresh.id);
      assert.equal(blocked.status, "new"); assert.equal(blocked.jobOutcome, "blocked"); assert.equal(blocked.agentRun, null);
      assert.match(blocked.jobResult, /no worker was started/);
      await request("/api/agent-jobs", { id: jobId, status: "running", agentRun: runFor(job.agentConfig) }, 409);
    });
  } finally {
    await catalog(original.models, original.runnerDefault);
    await profiles(original.discovery, original.execution);
    for (const [id, knownConfig] of jobs) {
      const config = knownConfig ?? (await queued(id)).agentConfig;
      await finish(id, config);
    }
    for (const id of ids) {
      const current = await card(id);
      await request("/api/ideas/action", { id, version: current.version, status: current.status, action: "no", label: "Discard synthetic routing fixture" });
    }
  }
});

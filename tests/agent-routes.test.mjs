import assert from "node:assert/strict";
import test from "node:test";
import { createRouteHarness } from "./helpers/route-harness.mjs";

async function fixture(t) {
  const h = await createRouteHarness();
  t.after(() => h.close());
  return h;
}

async function newTask(h, extra = {}) {
  const response = await h.request("/api/tasks", { task: "Local routing regression", ...extra });
  assert.equal(response.status, 201);
  return response.json();
}

async function newCard(h) {
  const task = await newTask(h);
  h.sqlite.prepare("DELETE FROM agent_jobs WHERE id = ?").run(task.jobId);
  h.sqlite.prepare("UPDATE ideas SET status = 'new' WHERE id = ?").run(task.ideaId);
  return { id: task.ideaId, version: 1, status: "new" };
}

function count(h, table) {
  return h.sqlite.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
}

test("New Task rolls back context, card and job if any write fails", async (t) => {
  for (const table of ["contexts", "agent_jobs"]) await t.test(table, async (t) => {
    const h = await fixture(t);
    h.sqlite.exec(`CREATE TRIGGER fail_write BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'fixture write failure'); END`);
    await assert.rejects(() => newTask(h, { context: "New private context" }), /fixture write failure/);
    for (const name of ["contexts", "ideas", "agent_jobs"]) assert.equal(count(h, name), 0, name);
    h.sqlite.exec("DROP TRIGGER fail_write");
    const created = await newTask(h, { context: "New private context" });
    assert.equal(count(h, "ideas"), 1);
    assert.equal(count(h, "agent_jobs"), 1);
    assert.equal(count(h, "contexts"), 1);
    const context = JSON.parse(h.sqlite.prepare("SELECT card_context FROM agent_jobs WHERE id = ?").get(created.jobId).card_context);
    assert.equal(context.idea.id, created.ideaId);
    assert.equal(context.task.generalContext, "New private context");
  });
});

test("New Task rejects a settings race without persisting context or work", async (t) => {
  const h = await fixture(t);
  h.beforeBatch(/^\s*INSERT INTO ideas/, () => h.sqlite.exec("UPDATE agent_settings SET revision = revision + 1"));
  const response = await h.request("/api/tasks", { task: "Concurrent settings", context: "Do not save on conflict", expectedSettingsRevision: 0 });
  assert.equal(response.status, 409);
  for (const table of ["contexts", "ideas", "agent_jobs"]) assert.equal(count(h, table), 0);
});

test("schema maintenance cannot consume a race intended for the task write", async (t) => {
  const h = await fixture(t);
  const afterMaintenanceExpiry = Date.now() + 61_000;
  t.mock.method(Date, "now", () => afterMaintenanceExpiry);
  h.beforeBatch(/^\s*INSERT INTO ideas/, () => h.sqlite.exec("UPDATE agent_settings SET revision = revision + 1"));
  // Without a caller revision, an early injection would be read as current
  // settings and incorrectly allow this task to commit with HTTP 201.
  const response = await h.request("/api/tasks", { task: "Race after maintenance" });
  assert.equal(response.status, 409);
  for (const table of ["contexts", "ideas", "agent_jobs"]) assert.equal(count(h, table), 0);
});

test("job completion and card state roll back together", async (t) => {
  const h = await fixture(t);
  const { ideaId, jobId } = await newTask(h);
  h.sqlite.prepare("UPDATE agent_jobs SET status = 'running' WHERE id = ?").run(jobId);
  h.sqlite.exec("CREATE TRIGGER fail_card BEFORE UPDATE ON ideas BEGIN SELECT RAISE(ABORT, 'fixture card failure'); END");
  await assert.rejects(() => h.request("/api/agent-jobs", { id: jobId, status: "done", ticketOutcome: "completed", result: "Verified result" }), /fixture card failure/);
  assert.equal(h.sqlite.prepare("SELECT status FROM agent_jobs WHERE id = ?").get(jobId).status, "running");
  assert.equal(h.sqlite.prepare("SELECT status FROM ideas WHERE id = ?").get(ideaId).status, "working");
  h.sqlite.exec("DROP TRIGGER fail_card");
  assert.equal((await h.request("/api/agent-jobs", { id: jobId, status: "done", ticketOutcome: "completed", result: "Verified result" })).status, 200);
  assert.equal(h.sqlite.prepare("SELECT status FROM ideas WHERE id = ?").get(ideaId).status, "done");
});

test("losing a job compare-and-set cannot change the card", async (t) => {
  const h = await fixture(t);
  const { ideaId, jobId } = await newTask(h);
  h.sqlite.prepare("UPDATE agent_jobs SET status = 'running' WHERE id = ?").run(jobId);
  h.beforeBatch(/^\s*UPDATE agent_jobs/, () => h.sqlite.prepare("UPDATE agent_jobs SET status = 'failed', ticket_outcome = 'blocked' WHERE id = ?").run(jobId));
  assert.equal((await h.request("/api/agent-jobs", { id: jobId, status: "done", ticketOutcome: "completed" })).status, 409);
  assert.equal(h.sqlite.prepare("SELECT status FROM ideas WHERE id = ?").get(ideaId).status, "working");
});

const run = { runner: "fixture", model: "fixture-model", thinkingLevel: "low", contextMode: "fresh", workerId: "fixture-worker" };

test("legacy lease renewal retains its actual worker metadata", async (t) => {
  const h = await fixture(t);
  const { jobId } = await newTask(h);
  assert.equal((await h.request("/api/agent-jobs", { id: jobId, status: "running", agentRun: run })).status, 200);
  assert.equal((await h.request("/api/agent-jobs", { id: jobId, status: "running" })).status, 200);
  assert.deepEqual(JSON.parse(h.sqlite.prepare("SELECT agent_run FROM agent_jobs WHERE id = ?").get(jobId).agent_run), run);
});

test("card action operands and job status must be JSON strings", async (t) => {
  const h = await fixture(t);
  const card = await newCard(h);
  for (const input of [{ status: ["new"], action: "no" }, { status: "new", action: ["no"] }]) {
    assert.equal((await h.request("/api/ideas/action", { ...card, ...input })).status, 400);
  }
  assert.equal((await h.request("/api/agent-jobs", { id: 1, status: ["running"] })).status, 400);
  assert.equal(h.sqlite.prepare("SELECT status FROM ideas WHERE id = ?").get(card.id).status, "new");
  assert.equal(count(h, "feedback"), 0);
});

test("Skip and approval roll back with every audit write", async (t) => {
  for (const action of ["no", "do"]) for (const table of ["card_attention", "card_interactions", "feedback"]) {
    await t.test(`${action}: ${table}`, async (t) => {
      const h = await fixture(t);
      const card = await newCard(h);
      h.sqlite.exec(`CREATE TRIGGER fail_audit BEFORE INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'fixture audit failure'); END`);
      await assert.rejects(() => h.request("/api/ideas/action", { ...card, action }), /fixture audit failure/);
      assert.equal(h.sqlite.prepare("SELECT status FROM ideas WHERE id = ?").get(card.id).status, "new");
      for (const name of ["card_attention", "card_interactions", "feedback", "agent_jobs"]) assert.equal(count(h, name), 0, name);
      h.sqlite.exec("DROP TRIGGER fail_audit");
      assert.equal((await h.request("/api/ideas/action", { ...card, action })).status, 200);
      assert.equal(count(h, "feedback"), 1);
      assert.equal(count(h, "card_interactions"), 1);
      assert.equal(count(h, "agent_jobs"), action === "do" ? 1 : 0);
    });
  }
});

test("stale card decisions cannot leave audit rows or jobs", async (t) => {
  for (const action of ["no", "do"]) await t.test(action, async (t) => {
    const h = await fixture(t);
    const card = await newCard(h);
    h.beforeBatch(/^\s*INSERT INTO card_interactions/, () => h.sqlite.prepare("UPDATE ideas SET version = version + 1 WHERE id = ?").run(card.id));
    assert.equal((await h.request("/api/ideas/action", { ...card, action })).status, 409);
    assert.equal(h.sqlite.prepare("SELECT status FROM ideas WHERE id = ?").get(card.id).status, "new");
    for (const name of ["card_attention", "card_interactions", "feedback", "agent_jobs"]) assert.equal(count(h, name), 0);
  });
});

test("reviewed and blocked cards keep the requested and actual run snapshot", async (t) => {
  for (const outcome of ["review", "blocked"]) await t.test(outcome, async (t) => {
    const h = await fixture(t);
    const { ideaId, jobId } = await newTask(h);
    const config = { modelId: "fixture/model", runner: run.runner, model: run.model, thinkingLevel: run.thinkingLevel, contextMode: "fresh", phase: "execution", source: "execution-default", settingsRevision: 0, cardRevision: 0 };
    h.sqlite.prepare("UPDATE agent_jobs SET agent_config = ?, agent_run = ?, status = ?, ticket_outcome = ? WHERE id = ?")
      .run(JSON.stringify(config), JSON.stringify(run), outcome === "blocked" ? "failed" : "done", outcome, jobId);
    h.sqlite.prepare("UPDATE ideas SET status = 'new' WHERE id = ?").run(ideaId);
    const response = await h.request(`/api/state?card=${ideaId}`);
    const state = await response.json();
    const idea = state.ideas.find((item) => item.id === ideaId);
    assert.ok(idea);
    assert.equal(idea.status, "new");
    assert.deepEqual(idea.agentConfig, config);
    assert.deepEqual(idea.agentRun, run);
  });
});

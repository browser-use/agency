import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  createStore,
  encodeEvent,
  decodeEvents,
} from "../scripts/linear-store.mjs";

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), "agency-linear-test-"));
  mkdirSync(join(root, "records"));
  const cfg = {
    output: root,
    workspace: "test",
    organizationId: "org",
    userId: "user",
    projectId: "project",
    teamId: "team",
    members: [
      { id: "user", name: "User" },
      { id: "other", name: "Other" },
    ],
    labels: { Product: "product" },
    states: {
      new: "new",
      working: "working",
      done: "done",
      rejected: "rejected",
      later: "later",
    },
    enableWrites: true,
  };
  const issue = {
    id: "issue-1",
    identifier: "TEST-1",
    title: "Fix a button",
    description: "Original",
    url: "https://example.invalid/1",
    project: { id: "project" },
    assignee: { id: "user", name: "User" },
    state: { id: "new", type: "unstarted" },
    labels: { nodes: [{ id: "product", name: "Product" }] },
    updatedAt: "2026-01-01T00:00:00Z",
  };
  const record = {
    idea: {
      id: 1,
      version: 1,
      headline: issue.title,
      project: "Agency",
      category: "Product",
      status: "new",
      rise_impact: 20,
      score: 80,
      dedupe_key: "button",
      card_html:
        '<article><h1>Fix the button</h1><button data-radar-action="do">Merge</button></article>',
    },
    jobs: [],
    feedback: [],
    attention: [],
    interactions: [],
  };
  const save = (p, v) => writeFileSync(join(root, p), JSON.stringify(v));
  save("records/1.json", record);
  save("manifest.json", {
    snapshotAt: "2026-01-02T00:00:00Z",
    rows: [{ sourceId: 1, issueId: "issue-1" }],
    topics: [{ id: "product", label: "Product", hint: "Features" }],
  });
  save("bridge-live.json", {
    syncedAt: "2026-01-02T00:00:00Z",
    issues: [[1, issue]],
  });
  const issues = new Map([[issue.id, issue]]),
    comments = new Map();
  let fault = null,
    createCount = 0;
  const api = async (q, v = {}) => {
    if (fault && q.includes(fault)) {
      fault = null;
      throw Error("Simulated unavailable read/write");
    }
    if (q.includes("viewer{"))
      return { viewer: { id: "user", organization: { id: "org" } } };
    if (q.includes("issueCreate")) {
      createCount++;
      const input = v.input;
      const i = {
        ...issue,
        id: input.id,
        title: input.title,
        description: input.description,
        state: { id: input.stateId },
        assignee: { id: input.assigneeId, name: "User" },
      };
      issues.set(i.id, i);
      return { issueCreate: { success: true, issue: structuredClone(i) } };
    }
    if (q.includes("issueUpdate")) {
      const i = issues.get(v.id);
      if (v.input.stateId) i.state.id = v.input.stateId;
      if (v.input.assigneeId)
        i.assignee = { id: v.input.assigneeId, name: "Other" };
      if (v.input.title) i.title = v.input.title;
      return { issueUpdate: { success: true, issue: structuredClone(i) } };
    }
    if (q.includes("commentCreate")) {
      comments.set(v.input.id, {
        ...v.input,
        issue: { id: v.input.issueId },
        user: { id: "user" },
        createdAt: new Date().toISOString(),
      });
      return { commentCreate: { success: true } };
    }
    if (q.includes("comments(filter:"))
      return {
        comments: {
          nodes: v.ids.map((id) => comments.get(id)).filter(Boolean),
        },
      };
    if (q.includes("comments(first:"))
      return {
        issue: {
          comments: {
            nodes: [...comments.values()].filter((c) => c.issueId === v.id),
            pageInfo: { hasNextPage: false },
          },
        },
      };
    if (q.includes("issues(filter:"))
      return {
        issues: {
          nodes: [...issues.values()]
            .filter((i) =>
              v.ids ? v.ids.includes(i.id) : i.project.id === cfg.projectId,
            )
            .map((i) => structuredClone(i)),
          pageInfo: { hasNextPage: false },
        },
      };
    throw Error("Unmocked query " + q);
  };
  const store = createStore(cfg, api);
  return {
    store,
    cfg,
    issues,
    comments,
    api,
    fault: (q) => (fault = q),
    createCount: () => createCount,
  };
}
const decide = {
  id: 1,
  version: 1,
  status: "new",
  action: "do",
  label: "Merge",
  prompt: "Merge the exact reviewed fix",
};
test("decision persists exact artifact, moves to working, and retry creates one job", async (t) => {
  const f = fixture(t);
  const a = await f.store.mutate("/api/ideas/action", decide);
  const b = await f.store.mutate("/api/ideas/action", decide);
  assert.deepEqual(a, b);
  assert.equal(f.store.jobs(new URL("http://localhost")).jobs.length, 1);
  assert.equal(f.issues.get("issue-1").state.id, "working");
  const job = f.store.records.get(1).jobs[0];
  assert.equal(JSON.parse(job.card_context).approvedVersion, 1);
  assert.equal(job.instruction, decide.prompt);
  assert.ok(
    [...f.comments.values()].some((c) => c.body.includes("Agency event v1")),
  );
});
test("skip is canceled without a job or completion points", async (t) => {
  const f = fixture(t);
  await f.store.mutate("/api/ideas/action", {
    ...decide,
    action: "no",
    label: "Skip",
  });
  assert.equal(f.issues.get("issue-1").state.id, "rejected");
  assert.equal(f.store.jobs(new URL("http://localhost")).jobs.length, 0);
  assert.equal(
    f.store.state(new URL("http://localhost")).completionStats.points,
    0,
  );
});
test("stale revision and moved project fail before mutations", async (t) => {
  const f = fixture(t);
  await assert.rejects(
    f.store.mutate("/api/ideas/action", { ...decide, version: 0 }),
    { status: 409 },
  );
  f.issues.get("issue-1").project.id = "elsewhere";
  await assert.rejects(f.store.mutate("/api/ideas/action", decide), {
    status: 409,
  });
  assert.equal(f.comments.size, 0);
});
test("comment lookup failure does not create a comment or queue", async (t) => {
  const f = fixture(t);
  f.fault("comments(filter:");
  await assert.rejects(f.store.mutate("/api/ideas/action", decide));
  assert.equal(f.comments.size, 0);
  assert.equal(f.store.jobs(new URL("http://localhost")).jobs.length, 0);
});
test("partial native update failure reconciles without duplicate history", async (t) => {
  const f = fixture(t);
  f.fault("issueUpdate");
  await assert.rejects(f.store.mutate("/api/ideas/action", decide));
  assert.equal(f.store.jobs(new URL("http://localhost")).jobs.length, 0);
  await f.store.mutate("/api/ideas/action", decide);
  assert.equal(f.store.jobs(new URL("http://localhost")).jobs.length, 1);
  assert.equal(
    [...f.comments.values()].filter((c) => c.body.includes("Agency event v1"))
      .length,
    1,
  );
});
test("fresh store recovers the committed event from Linear", async (t) => {
  const f = fixture(t);
  await f.store.mutate("/api/ideas/action", decide);
  const recovered = createStore(f.cfg, f.api);
  await recovered.fresh("issue-1");
  assert.equal(recovered.jobs(new URL("http://localhost")).jobs.length, 1);
});
test("same new-task request id creates one assigned issue", async (t) => {
  const f = fixture(t);
  const p = { task: "Check the docs", requestId: "request-123456" };
  const a = await f.store.mutate("/api/tasks", p);
  const b = await f.store.mutate("/api/tasks", p);
  assert.deepEqual(a, b);
  assert.equal(f.createCount(), 1);
  assert.equal([...f.issues.values()].at(-1).assignee.id, "user");
});
test("worker must claim; completion needs outcome and evidence", async (t) => {
  const f = fixture(t);
  const { jobId } = await f.store.mutate("/api/ideas/action", decide);
  await assert.rejects(
    f.store.mutate("/api/agent-jobs", {
      id: jobId,
      status: "done",
      workerId: "one",
      ticketOutcome: "completed",
      result: "checked",
    }),
    { status: 409 },
  );
  await f.store.mutate("/api/agent-jobs", {
    id: jobId,
    status: "running",
    workerId: "one",
  });
  await assert.rejects(
    f.store.mutate("/api/agent-jobs", {
      id: jobId,
      status: "running",
      workerId: "two",
    }),
    { status: 409 },
  );
  await f.store.mutate("/api/agent-jobs", {
    id: jobId,
    status: "done",
    workerId: "one",
    ticketOutcome: "completed",
    result: "Verified the approved result",
  });
  assert.equal(
    f.store.state(new URL("http://localhost")).completionStats.points,
    8,
  );
});
test("review and blocked do not count as done", async (t) => {
  for (const outcome of ["review", "blocked"]) {
    const f = fixture(t);
    const { jobId } = await f.store.mutate("/api/ideas/action", decide);
    await f.store.mutate("/api/agent-jobs", {
      id: jobId,
      status: "running",
      workerId: "one",
    });
    await f.store.mutate("/api/agent-jobs", {
      id: jobId,
      status: outcome === "blocked" ? "failed" : "done",
      ticketOutcome: outcome,
      result: "Evidence",
      workerId: "one",
    });
    assert.equal(
      f.store.state(new URL("http://localhost")).completionStats.points,
      0,
    );
    assert.notEqual(f.issues.get("issue-1").state.id, "done");
  }
});
test("revision keeps issue and owner, and requires expected version", async (t) => {
  const f = fixture(t);
  await f.store.mutate("/api/linear/assignee", { id: 1, assigneeId: "other" });
  const p = {
    dedupeKey: "button",
    expectedVersion: 1,
    project: "Agency",
    category: "Product",
    headline: "Better button",
    cardHtml:
      '<article><h1>The fixed button</h1><p>Before and after</p><button data-radar-action="do">Merge</button></article>',
    rise: { reach: 10, impact: 20, strategicFit: 20, ease: 20 },
  };
  await f.store.mutate("/api/ideas", p);
  assert.equal(f.issues.size, 1);
  assert.equal(f.issues.get("issue-1").assignee.id, "other");
  assert.equal(f.store.records.get(1).idea.version, 2);
  await assert.rejects(
    f.store.mutate("/api/ideas", { ...p, headline: "Another" }),
    { status: 409 },
  );
});
test("chunked revision round trip and corruption detection", () => {
  const event = {
    summary: "Snapshot",
    record: { value: "hello".repeat(20000) },
  };
  const id = "id";
  const encoded = encodeEvent(event, id);
  const comments = [...encoded.chunks, { id, body: encoded.body }].map((c) => ({
    ...c,
    user: { id: "user" },
    createdAt: "2026-01-01",
  }));
  assert.deepEqual(decodeEvents(comments, ["user"])[0].record, event.record);
  comments[0].body = "bad";
  assert.throws(() => decodeEvents(comments, ["user"]));
});
test("paused migration rejects mutations", async (t) => {
  const f = fixture(t);
  f.cfg.enableWrites = false;
  await assert.rejects(f.store.mutate("/api/ideas/action", decide), {
    status: 503,
  });
  assert.equal(f.comments.size, 0);
});

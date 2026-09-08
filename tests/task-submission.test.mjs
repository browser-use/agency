import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { MAX_CONTEXT_LENGTH, MAX_TASK_LENGTH, submitNewTask } from "../lib/task-submission.ts";

test("new tasks send task and retry identity, never a stale profile", async () => {
  let calls = 0;
  const result = await submitNewTask("  Fix the login bug  ", async (url, options) => {
    calls++;
    assert.equal(url, "/api/tasks");
    assert.equal(options.method, "POST");
    const body=JSON.parse(options.body);
    assert.equal(body.task,"Fix the login bug");
    assert.match(body.requestId,/^[0-9a-f-]{36}$/);
    assert.equal(body.context,undefined);
    return Response.json({ ok: true, ideaId: 81, jobId: 95 }, { status: 201 });
  });
  assert.deepEqual(result, { ideaId: 81, jobId: 95 });
  assert.equal(calls, 1);
});

test("failed requests expose the server's error instead of reporting success", async () => {
  await assert.rejects(submitNewTask("task", async () => Response.json({ error: "Task must be 1–5000 characters." }, { status: 400 })), /Task must be/);
  await assert.rejects(submitNewTask("task", async () => new Response("Unavailable", { status: 503 })), /could not queue/);
});

test("ambiguous and network responses are not silently retried or called queued", async () => {
  for (const body of ["not json", "{}", '{"ok":true}', '{"ok":true,"jobId":"9","ideaId":1}']) {
    await assert.rejects(submitNewTask("task", async () => new Response(body)), /did not confirm/);
  }
  let calls = 0;
  await assert.rejects(submitNewTask("task", async () => { calls++; throw new TypeError("Failed to fetch"); }), /Failed to fetch/);
  assert.equal(calls, 1);
});

// Execute the real route with a private recording DB. No live queue is touched.
async function taskRoute(savedContext) {
  const writes = [];
  const db = {
    prepare(sql) {
      let bindings = [];
      return {
        bind(...args) { bindings = args; return this; },
        async first() {
          if (sql.startsWith("SELECT text FROM contexts")) return { text: savedContext };
          writes.push({ sql, bindings });
          if (sql.startsWith("INSERT INTO ideas")) return { id: 81 };
          if (sql.startsWith("INSERT INTO agent_jobs")) return { id: 95 };
          throw new Error(`Unexpected query: ${sql}`);
        },
        async run() { writes.push({ sql, bindings }); },
      };
    },
  };
  const source = (await readFile(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8"))
    .replace(/^import .+;\n/gm, "")
    .replace("export async function POST", "async function POST");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const handler = new Function("ensureDatabase", "MAX_CONTEXT_LENGTH", "MAX_TASK_LENGTH", `${compiled}\nreturn POST;`)(async () => db, MAX_CONTEXT_LENGTH, MAX_TASK_LENGTH);
  return { writes, post: (payload, origin) => handler(new Request("http://localhost/api/tasks", { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body: JSON.stringify(payload) })) };
}

test("20,603-character saved context queues once and is retained in the job", async () => {
  const context = "x".repeat(20_603);
  const route = await taskRoute(context);
  const response = await route.post({ task: "A real task" });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true, ideaId: 81, jobId: 95 });
  assert.equal(route.writes.length, 2);
  const card = JSON.parse(route.writes[0].bindings[2]);
  assert.equal(card.generalContext, context);
  const job = JSON.parse(route.writes[1].bindings[2]);
  assert.equal(job.task.generalContext, context);
});

test("older clients can submit the same full-length saved context without rejection", async () => {
  const context = "x".repeat(MAX_CONTEXT_LENGTH);
  const route = await taskRoute(context);
  assert.equal((await route.post({ task: "Task", context })).status, 201);
  assert.equal(route.writes.length, 2, "unchanged context does not create another context row");
});

test("task size, context size and cross-origin rejection create no jobs", async () => {
  const route = await taskRoute("saved context");
  for (const payload of [{ task: "" }, { task: "x".repeat(MAX_TASK_LENGTH + 1) }, { task: "task", context: "x".repeat(MAX_CONTEXT_LENGTH + 1) }]) {
    assert.equal((await route.post(payload)).status, 400);
  }
  assert.equal((await route.post({ task: "task" }, "https://other.test")).status, 403);
  assert.equal(route.writes.length, 0);
});

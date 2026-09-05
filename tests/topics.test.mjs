import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import ts from "typescript";
import { clusterForCard, parseTopicRow } from "../lib/card-cluster.ts";

async function fixture(t) {
  const sqlite = new DatabaseSync(":memory:");
  t.after(() => sqlite.close());
  sqlite.exec("CREATE TABLE topics (id TEXT PRIMARY KEY, label TEXT NOT NULL, hint TEXT NOT NULL DEFAULT '', keywords TEXT NOT NULL DEFAULT '', position INTEGER DEFAULT 0, created_at TEXT DEFAULT CURRENT_TIMESTAMP)");
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let values = [];
      return {
        bind(...args) { values = args; return this; },
        async run() { return statement.run(...values); },
        async all() { return { results: statement.all(...values) }; },
      };
    },
  };
  const source = (await readFile(new URL("../app/api/topics/route.ts", import.meta.url), "utf8"))
    .replace(/^import .+;\n/gm, "").replace(/export async function/g, "async function");
  const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const { POST, GET } = new Function("ensureDatabase", "parseTopicRow", compiled + "\nreturn { POST, GET };")(async () => db, parseTopicRow);
  return {
    sqlite, get: GET,
    post: (payload, origin) => POST(new Request("http://localhost/api/topics", {
      method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) },
      body: JSON.stringify(payload),
    })),
  };
}

test("a new topic needs only a name and description and files cards by its name", async (t) => {
  const { post, get } = await fixture(t);
  const response = await post({ label: "Hiring", hint: "Candidates and interviews" });
  assert.equal(response.status, 201);
  assert.deepEqual(await response.json(), { ok: true, id: "hiring" });
  const { topics } = await (await get()).json();
  assert.equal(topics[0].label, "Hiring");
  assert.equal(topics[0].hint, "Candidates and interviews");
  assert.deepEqual(topics[0].keywords, []);
  assert.equal(clusterForCard({ category: "Hiring · interview" }, topics), "hiring");
});

test("editing only name and description preserves existing card routing", async (t) => {
  const { post, get, sqlite } = await fixture(t);
  sqlite.prepare("INSERT INTO topics (id,label,hint,keywords,position) VALUES (?,?,?,?,?)")
    .run("growth", "Growth", "Old description", "distribution,reply", 1);
  const before = (await (await get()).json()).topics;
  assert.equal(clusterForCard({ category: "Distribution · X reply" }, before), "growth");
  assert.equal((await post({ id: "growth", label: "Growth", hint: "Useful posts and replies" })).status, 201);
  const after = (await (await get()).json()).topics;
  assert.equal(after[0].hint, "Useful posts and replies");
  assert.equal(clusterForCard({ category: "Distribution · X reply" }, after), "growth");
  assert.equal(sqlite.prepare("SELECT keywords FROM topics").get().keywords, "distribution,reply");
});

test("legacy keyword input cannot replace routing and invalid topics create no rows", async (t) => {
  const { post, sqlite } = await fixture(t);
  assert.equal((await post({ label: "Work", hint: "Things to do", keywords: ["everything"] })).status, 201);
  assert.equal(sqlite.prepare("SELECT keywords FROM topics").get().keywords, "");
  assert.equal((await post({ label: "" })).status, 400);
  assert.equal((await post({ label: "Other" }, "https://other.test")).status, 403);
  assert.equal(sqlite.prepare("SELECT COUNT(*) AS count FROM topics").get().count, 1);
});

test("topic settings expose only name and description", async () => {
  const source = await readFile(new URL("../app/settings/page.tsx", import.meta.url), "utf8");
  assert.match(source, /<span>Name<\/span>/);
  assert.match(source, /<span>Description<\/span>/);
  assert.doesNotMatch(source, /keywords/i);
});

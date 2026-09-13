import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { PassThrough, Writable } from "node:stream";
import { discoverCodexModels, normalizeCodexModels } from "../scripts/lib/codex-models.mjs";
import { agencyUrl } from "../scripts/lib/agency-client.mjs";
import { mergeCodexCatalog } from "../scripts/sync-models.mjs";
import { parseAgentCatalog } from "../lib/agent-models.ts";

const model = { model: "fixture-model", displayName: "Fixture model", defaultReasoningEffort: "low", supportedReasoningEfforts: [{ reasoningEffort: "low" }, { reasoningEffort: "high" }], isDefault: true };
function fakeServer(reply) {
  const messages = [];
  const child = new EventEmitter();
  child.stdout = new PassThrough(); child.stderr = new PassThrough();
  child.stdin = new Writable({ write(chunk, encoding, done) {
    const message = JSON.parse(chunk.toString()); messages.push(message);
    queueMicrotask(() => { const result = reply(message); if (result !== undefined) child.stdout.write(`${JSON.stringify({ id: message.id, result })}\n`); });
    done();
  } });
  child.kill = () => { child.killed = true; queueMicrotask(() => child.emit("exit", 0)); };
  return { child, messages, spawnProcess: () => child };
}

test("model discovery initializes then reads every catalog page without starting a turn", async () => {
  const server = fakeServer((message) => message.method === "initialize" ? {} : message.method === "model/list" ? {
    data: [{ ...model, model: message.params.cursor ? "second" : "first" }], nextCursor: message.params.cursor ? null : "page-two",
  } : undefined);
  const catalog = await discoverCodexModels({ spawnProcess: server.spawnProcess });
  assert.equal(catalog.models.length, 2);
  assert.deepEqual(server.messages.map((item) => item.method), ["initialize", "initialized", "model/list", "model/list"]);
  assert.equal(server.messages[2].params.cursor, null);
  assert.equal(server.messages[3].params.cursor, "page-two");
  assert.equal(server.child.killed, true);
});

test("a stuck model reader is bounded and cleaned up", async () => {
  const server = fakeServer(() => undefined);
  await assert.rejects(discoverCodexModels({ spawnProcess: server.spawnProcess, timeoutMs: 20 }), /timed out/);
  assert.equal(server.child.killed, true);
});

test("repeated cursors cannot loop forever", async () => {
  const server = fakeServer((message) => message.method === "initialize" ? {} : message.method === "model/list" ? { data: [model], nextCursor: "stuck" } : undefined);
  await assert.rejects(discoverCodexModels({ spawnProcess: server.spawnProcess }), /did not advance/);
  assert.equal(server.child.killed, true);
});

test("the complete 100-model discovery boundary is accepted by the API catalog parser", async () => {
  const rows = Array.from({ length: 100 }, (_, index) => ({ ...model, model: `fixture-${index}` }));
  const server = fakeServer((message) => message.method === "initialize" ? {} : message.method === "model/list" ? {
    data: message.params.cursor ? rows.slice(50) : rows.slice(0, 50), nextCursor: message.params.cursor ? null : "page-two",
  } : undefined);
  const catalog = await discoverCodexModels({ spawnProcess: server.spawnProcess });
  assert.equal(catalog.models.length, 100);
  assert.deepEqual(parseAgentCatalog(catalog.models), catalog.models);
  assert.equal(catalog.models[99].model, "fixture-99");
  assert.throws(() => parseAgentCatalog([...catalog.models, {
    ...catalog.models[0], id: "codex/fixture-100", model: "fixture-100",
  }]), /at most 100 entries/);
  assert.equal(server.child.killed, true);
});

test("discovery rejects a 101-model catalog explicitly without truncating a page", async () => {
  const rows = Array.from({ length: 101 }, (_, index) => ({ ...model, model: `fixture-${index}` }));
  const server = fakeServer((message) => message.method === "initialize" ? {} : message.method === "model/list" ? {
    data: message.params.cursor ? rows.slice(100) : rows.slice(0, 100), nextCursor: message.params.cursor ? null : "page-two",
  } : undefined);
  await assert.rejects(discoverCodexModels({ spawnProcess: server.spawnProcess }), /more than 100 visible models.*No models were registered/);
  assert.equal(server.messages.filter((message) => message.method === "model/list").length, 2);
  assert.equal(server.child.killed, true);
});

test("hidden models do not consume the API's visible catalog allowance", () => {
  const rows = Array.from({ length: 100 }, (_, index) => ({ ...model, model: `fixture-${index}` }));
  const catalog = normalizeCodexModels([...rows, { ...model, model: "hidden", hidden: true }]);
  assert.equal(parseAgentCatalog(catalog.models).length, 100);
});

test("only runtime-supported thinking levels and visible models are registered", () => {
  const result = normalizeCodexModels([model, { ...model, model: "hidden", hidden: true }]);
  assert.deepEqual(result.models[0].thinkingLevels, ["low", "high"]);
  assert.equal(result.models.length, 1);
  assert.deepEqual(result.runnerDefault, { modelId: "codex/fixture-model", thinkingLevel: "low" });
  assert.throws(() => normalizeCodexModels([{ ...model, defaultReasoningEffort: "invented" }]), /incomplete/);
});

test("the local helper refuses remote origins, credentials and URL suffixes", () => {
  assert.equal(agencyUrl("http://127.0.0.1:3101"), "http://127.0.0.1:3101");
  assert.equal(agencyUrl("http://[::1]:3101/"), "http://[::1]:3101");
  for (const value of ["https://example.com", "http://user:password@localhost:3101", "http://localhost:3101/api", "http://localhost:3101/?key=value", "file:///tmp/agency"]) assert.throws(() => agencyUrl(value), /loopback/);
});

test("catalog refresh replaces a removed thinking default and follows Codex's live default", () => {
  const discovered = normalizeCodexModels([model]);
  const current = { models: discovered.models, runnerDefault: { modelId: "codex/fixture-model", thinkingLevel: "removed-level" } };
  assert.deepEqual(mergeCodexCatalog(current, discovered).runnerDefault, discovered.runnerDefault);
  const switched = normalizeCodexModels([{ ...model, isDefault: false }, { ...model, model: "new-default", isDefault: true }]);
  assert.equal(mergeCodexCatalog({ ...current, runnerDefault: discovered.runnerDefault }, switched).runnerDefault.modelId, "codex/new-default");
});

test("refreshing Codex preserves another runner's supported default", () => {
  const discovered = normalizeCodexModels([model]);
  const other = { ...discovered.models[0], id: "other/fixture", runner: "other" };
  const current = { models: [other], runnerDefault: { modelId: other.id, thinkingLevel: "high" } };
  const merged = mergeCodexCatalog(current, discovered);
  assert.deepEqual(merged.runnerDefault, current.runnerDefault);
  assert.ok(merged.models.some((entry) => entry.id === other.id));
});

import { spawn } from "node:child_process";

export function normalizeCodexModels(rows) {
  const visible = rows.filter((row) => !row.hidden);
  const models = visible.map((row) => ({
    id: `codex/${row.model}`,
    runner: "codex",
    model: row.model,
    label: row.displayName || row.model,
    thinkingLevels: row.supportedReasoningEfforts.map((item) => item.reasoningEffort),
    defaultThinkingLevel: row.defaultReasoningEffort,
  }));
  if (!models.length || models.some((model) => typeof model.model !== "string" || !model.model ||
    !model.thinkingLevels.length || !model.thinkingLevels.includes(model.defaultThinkingLevel))) {
    throw new Error("Codex returned an incomplete model catalog.");
  }
  const preferred = visible.find((row) => row.isDefault) || visible[0];
  return { models, runnerDefault: { modelId: `codex/${preferred.model}`, thinkingLevel: preferred.defaultReasoningEffort } };
}

// App Server is a short-lived metadata reader here. No thread or turn is started.
export async function discoverCodexModels({ executable = process.env.CODEX_BIN || "codex", timeoutMs = 20_000, spawnProcess = spawn } = {}) {
  const child = spawnProcess(executable, ["app-server"], { stdio: ["pipe", "pipe", "pipe"] });
  let nextId = 0;
  let buffered = "";
  const pending = new Map();
  let ended = false;
  function fail(error) {
    ended = true;
    for (const call of pending.values()) call.reject(error);
    pending.clear();
  }
  child.on("error", () => fail(new Error("Could not start Codex. Check CODEX_BIN and your installed CLI.")));
  child.on("exit", (code) => fail(new Error(`Codex model discovery ended before completing (exit ${code ?? "signal"}).`)));
  child.stderr.resume();
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffered += chunk;
    if (buffered.length > 2_000_000) { fail(new Error("Codex model response exceeded the size limit.")); child.kill(); return; }
    let newline;
    while ((newline = buffered.indexOf("\n")) >= 0) {
      const line = buffered.slice(0, newline); buffered = buffered.slice(newline + 1);
      let message;
      try { message = JSON.parse(line); } catch { continue; }
      const call = pending.get(message.id);
      if (!call) continue;
      pending.delete(message.id);
      if (message.error) call.reject(new Error(`Codex rejected ${call.method}. Check that your CLI supports App Server model discovery.`));
      else call.resolve(message.result);
    }
  });
  function request(method, params) {
    if (ended) return Promise.reject(new Error("Codex model discovery is no longer running."));
    const id = ++nextId;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject, method });
      child.stdin.write(`${JSON.stringify({ id, method, params })}\n`);
    });
  }
  const timeout = setTimeout(() => { fail(new Error("Codex model discovery timed out.")); child.kill(); }, timeoutMs);
  try {
    await request("initialize", { clientInfo: { name: "agency", title: "Agency model discovery", version: "0.1.0" } });
    child.stdin.write(`${JSON.stringify({ method: "initialized", params: {} })}\n`);
    const rows = [];
    let cursor = null;
    const cursors = new Set();
    do {
      const page = await request("model/list", { cursor, limit: 100, includeHidden: false });
      if (!Array.isArray(page?.data)) throw new Error("Codex returned an invalid model catalog.");
      rows.push(...page.data);
      cursor = page.nextCursor ?? null;
      if (cursor && cursors.has(cursor)) throw new Error("Codex model pagination did not advance.");
      if (cursor) cursors.add(cursor);
      if (rows.length > 500) throw new Error("Codex model catalog exceeded the size limit.");
    } while (cursor);
    return normalizeCodexModels(rows);
  } finally {
    clearTimeout(timeout);
    child.stdin.end();
    child.kill();
  }
}

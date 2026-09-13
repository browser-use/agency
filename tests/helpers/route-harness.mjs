import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

// Exercise the actual routes and schema against SQLite. Like D1, batch runs
// sequentially in one transaction and rolls back if any statement fails.
export async function createRouteHarness() {
  const sqlite = new DatabaseSync(":memory:");
  let beforeBatch;
  function prepare(query, bindings = []) {
    function execute() {
      const results = sqlite.prepare(query).all(...bindings).map((row) => ({ ...row }));
      return { success: true, results };
    }
    return {
      query,
      bind: (...values) => prepare(query, values),
      first: async () => execute().results[0] ?? null,
      all: async () => execute(),
      run: async () => execute(),
      execute,
    };
  }
  const db = {
    prepare,
    async batch(statements) {
      const hook = beforeBatch;
      // Schema maintenance can batch before the route reaches its write. Keep
      // the race armed until the explicitly targeted transaction is reached.
      if (hook && statements.some((statement) => hook.sqlPattern.test(statement.query))) {
        beforeBatch = undefined;
        hook.callback();
      }
      sqlite.exec("BEGIN");
      try {
        const results = statements.map((statement) => statement.execute());
        sqlite.exec("COMMIT");
        return results;
      } catch (error) {
        sqlite.exec("ROLLBACK");
        throw error;
      }
    },
  };
  const key = `agency-test-${randomUUID()}`;
  globalThis[key] = db;
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const server = await createServer({
    root,
    configFile: false,
    logLevel: "silent",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, watch: null },
    plugins: [{
      name: "test-cloudflare-database",
      resolveId(id) { if (id === "cloudflare:workers") return "\0test-cloudflare-workers"; },
      load(id) { if (id === "\0test-cloudflare-workers") return `export const env = { DB: globalThis[${JSON.stringify(key)}] };`; },
    }],
  });
  try {
    const schema = await server.ssrLoadModule("/db/index.ts");
    await schema.ensureDatabase();
  } catch (error) {
    await server.close();
    sqlite.close();
    delete globalThis[key];
    throw error;
  }
  return {
    sqlite,
    beforeBatch(sqlPattern, callback) { beforeBatch = { sqlPattern, callback }; },
    async request(path, body) {
      const route = await server.ssrLoadModule(`/app${path.split("?")[0]}/route.ts`);
      const request = new Request(`http://localhost${path}`, body === undefined ? {} : {
        method: "POST",
        headers: { "content-type": "application/json", "x-radar-local-agent": "1" },
        body: JSON.stringify(body),
      });
      return body === undefined ? route.GET(request) : route.POST(request);
    },
    async close() {
      await server.close();
      sqlite.close();
      delete globalThis[key];
    },
  };
}

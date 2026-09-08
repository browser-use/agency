import { createServer } from "node:http";
import { createLinearApi } from "./linear-cli.mjs";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createStore, fail } from "./linear-store.mjs";

const cfg = JSON.parse(
  readFileSync(resolve(process.argv[2] || ".linear-migration.json"), "utf8"),
);
const store = createStore(cfg, createLinearApi(cfg));
// One serial coordinator prevents poll/action and double-click races on this host.
let gate = Promise.resolve();
const enqueue = (fn) => {
  const work = gate.then(fn);
  gate = work.catch(() => {});
  return work;
};
const server = createServer(async (req, res) => {
  res.setHeader("content-type", "application/json");
  res.setHeader("cache-control", "no-store");
  try {
    if (req.headers["x-radar-local-agent"] !== "1")
      fail(403, "Local proxy header required");
    if (req.headers.origin)
      fail(403, "Use the same-origin Agency proxy, not the bridge directly");
    if (
      !["127.0.0.1", "localhost", "[::1]"].includes(
        new URL("http://" + req.headers.host).hostname,
      )
    )
      fail(403, "Local only");
    const url = new URL(req.url, "http://127.0.0.1");
    if (req.method === "GET") {
      if (url.pathname === "/api/state")
        return res.end(JSON.stringify(store.state(url)));
      if (url.pathname === "/api/stats")
        return res.end(JSON.stringify(store.stats(url)));
      if (url.pathname === "/api/agent-jobs")
        return res.end(JSON.stringify(store.jobs(url)));
      if (url.pathname === "/api/topics")
        return res.end(JSON.stringify({ topics: store.topics() }));
      fail(404, "Not found");
    }
    let body = "";
    for await (const chunk of req) {
      body += chunk;
      if (Buffer.byteLength(body) > 2000000) fail(413, "Request too large");
    }
    const payload = JSON.parse(body || "{}");
    if (req.method === "DELETE") payload.id = url.searchParams.get("id");
    res.end(
      JSON.stringify(
        await enqueue(() => store.mutate(url.pathname, payload, req.method)),
      ),
    );
  } catch (e) {
    res.writeHead(e.status || 502);
    res.end(JSON.stringify({ error: e.message }));
  }
});
server.listen(Number(cfg.bridgePort || 3130), "127.0.0.1", () =>
  console.log(
    "Agency Linear CLI bridge on 127.0.0.1:" + (cfg.bridgePort || 3130),
  ),
);
const poll = () =>
  enqueue(() => store.sync()).catch((e) => console.error(e.message));
void poll();
const timer = setInterval(poll, 60000);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    clearInterval(timer);
    server.close(() => process.exit(0));
  });

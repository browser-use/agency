import type { Plugin } from "vite";

/** Optional, local-only adapter. Hosted deployments keep the existing D1 backend. */
export function linearProxy(): Plugin {
  return {
    name: "agency-linear-local",
    configureServer(server) {
      const configured = process.env.AGENCY_LINEAR_BRIDGE_URL;
      if (!configured) return;
      const bridge = new URL(configured);
      if (
        bridge.protocol !== "http:" ||
        !["localhost", "127.0.0.1", "[::1]"].includes(bridge.hostname)
      )
        throw new Error("Linear bridge must be an HTTP loopback URL");
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api/")) return next();
        const origin = new URL(`http://${req.headers.host}`);
        const reject = (status: number, error: string) => {
          res.writeHead(status, { "content-type": "application/json" });
          res.end(JSON.stringify({ error }));
        };
        if (!["localhost", "127.0.0.1", "[::1]"].includes(origin.hostname))
          return reject(403, "Local only");
        if (req.headers.origin && req.headers.origin !== origin.origin)
          return reject(403, "Blocked origin");
        if (
          req.method !== "GET" &&
          !req.headers.origin &&
          req.headers["x-radar-local-agent"] !== "1"
        )
          return reject(403, "Local agent header required");
        try {
          let body = "";
          if (!["GET", "HEAD"].includes(req.method || "GET")) {
            for await (const chunk of req) {
              body += chunk;
              if (Buffer.byteLength(body) > 2000000)
                return reject(413, "Request too large");
            }
          }
          const response = await fetch(new URL(req.url, bridge), {
            method: req.method,
            headers: {
              "content-type": "application/json",
              "x-radar-local-agent": "1",
            },
            body: body || undefined,
            signal: AbortSignal.timeout(120000),
          });
          res.writeHead(response.status, {
            "content-type": "application/json",
            "cache-control": "no-store",
          });
          res.end(await response.text());
        } catch {
          return reject(
            503,
            "Linear did not confirm the request. Your draft stays here; check Working before retrying.",
          );
        }
      });
    },
  };
}

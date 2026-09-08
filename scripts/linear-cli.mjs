import { execFile } from "node:child_process";

export function gql(v) {
  if (Array.isArray(v)) return "[" + v.map(gql).join(",") + "]";
  if (v && typeof v === "object")
    return (
      "{" +
      Object.entries(v)
        .map(([k, v]) => k + ":" + gql(v))
        .join(",") +
      "}"
    );
  if (v === undefined) throw Error("Missing GraphQL variable");
  return JSON.stringify(v);
}
/** CLI-only transport; no token extraction, shell interpolation, or large argv payloads. */
export function createLinearApi(cfg) {
  return (query, vars = {}) =>
    new Promise((done, reject) => {
      const input = query
        .replace(/^(query|mutation)\s*\([^)]*\)/, "$1")
        .replace(/\$([A-Za-z][A-Za-z0-9_]*)/g, (_, name) => gql(vars[name]));
      const child = execFile(
        "npx",
        [
          "--yes",
          "@schpet/linear-cli@2.6.0",
          "--workspace",
          cfg.workspace,
          "api",
        ],
        {
          env: { ...process.env, LINEAR_IGNORE_ENV_FILE: "1", NO_COLOR: "1" },
          encoding: "utf8",
          timeout: 60000,
          maxBuffer: 16 * 1024 * 1024,
        },
        (error, stdout) => {
          if (error)
            return reject(
              Error(
                "Linear CLI request failed. Check connectivity and authentication before retrying.",
              ),
            );
          try {
            const r = JSON.parse(stdout);
            if (r.errors?.length)
              throw Error(
                "Linear rejected the request. Nothing was confirmed.",
              );
            done(r.data);
          } catch (e) {
            reject(e);
          }
        },
      );
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    });
}

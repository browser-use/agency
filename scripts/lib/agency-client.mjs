export function agencyUrl(value = process.env.RADAR_URL || "http://localhost:3100") {
  const url = new URL(value);
  if (!["http:", "https:"].includes(url.protocol) || !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname !== "/") {
    throw new Error("RADAR_URL must be a loopback Agency origin, without credentials, a path, or query parameters.");
  }
  return url.origin;
}

export async function agencyRequest(base, path, body) {
  const response = await fetch(`${agencyUrl(base)}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-radar-local-agent": "1", "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  const result = await response.json().catch(() => null);
  if (!result) throw new Error(`Agency did not return its API response (HTTP ${response.status}). Check RADAR_URL and that this checkout includes model routing.`);
  if (!response.ok) throw new Error(result.error || `Agency returned HTTP ${response.status}.`);
  return result;
}

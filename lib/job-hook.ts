import { env } from "cloudflare:workers";

// Optional: a local runner can set AGENCY_JOB_HOOK_URL to hear about a queued job at once
// instead of polling GET /api/agent-jobs. Best effort; the queue stays the source of truth.
export async function announceQueuedJob() {
  const url = (env as unknown as { AGENCY_JOB_HOOK_URL?: string }).AGENCY_JOB_HOOK_URL;
  if (!url) return;
  await fetch(url, { method: "POST", signal: AbortSignal.timeout(1_000) }).catch(() => undefined);
}

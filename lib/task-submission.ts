export const MAX_TASK_LENGTH = 5_000;
export const MAX_CONTEXT_LENGTH = 40_000;

// Retain the same id after a network failure; a retry must not create a second Linear issue.
const pending = new Map<string, string>();

export async function submitNewTask(task: string, fetcher: typeof fetch = fetch) {
  const normalized=task.trim();
  let requestId=pending.get(normalized);
  if(!requestId){requestId=crypto.randomUUID();pending.set(normalized,requestId);}
  const response = await fetcher("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    // The server attaches the latest saved context. Sending the composer's
    // snapshot could reject a valid task or overwrite newer context.
    body: JSON.stringify({ task: normalized, requestId }),
  });
  const result = await response.json().catch(() => null) as { ok?: boolean; jobId?: number; ideaId?: number; error?: string } | null;
  if (!response.ok) {
    throw new Error(result?.error || "Agency could not queue this task. Your draft is still here.");
  }
  if (!result?.ok || !Number.isInteger(result.jobId) || !Number.isInteger(result.ideaId)) {
    throw new Error("Agency did not confirm this task. Your draft is still here; check Working before sending again.");
  }
  pending.delete(normalized);
  return { jobId: result.jobId!, ideaId: result.ideaId! };
}

export const MAX_TASK_LENGTH = 5_000;
export const MAX_CONTEXT_LENGTH = 40_000;

export async function submitNewTask(task: string, fetcher: typeof fetch = fetch) {
  const response = await fetcher("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    // The server attaches the latest saved context. Sending the composer's
    // snapshot could reject a valid task or overwrite newer context.
    body: JSON.stringify({ task: task.trim() }),
  });
  const result = await response.json().catch(() => null) as { ok?: boolean; jobId?: number; ideaId?: number; error?: string } | null;
  if (!response.ok) {
    throw new Error(result?.error || "Agency could not queue this task. Your draft is still here.");
  }
  if (!result?.ok || !Number.isInteger(result.jobId) || !Number.isInteger(result.ideaId)) {
    throw new Error("Agency did not confirm this task. Your draft is still here; check Working before sending again.");
  }
  return { jobId: result.jobId!, ideaId: result.ideaId! };
}

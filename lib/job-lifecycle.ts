export const JOB_LEASE_MS = 6 * 60 * 60 * 1000;
export const MAX_CONCURRENT_JOBS = 10;

export type StoredJobStatus = "queued" | "running" | "done" | "failed";
export type VisibleJobStatus = StoredJobStatus;

export function jobLeaseWindow() {
  return `-${Math.floor(JOB_LEASE_MS / 1000)} seconds`;
}

export function visibleJobStatus(
  status: StoredJobStatus,
  updatedAt: string,
  now = Date.now(),
): VisibleJobStatus {
  if (status !== "running") return status;
  const updatedAtMs = Date.parse(`${updatedAt.replace(" ", "T")}Z`);
  if (!Number.isFinite(updatedAtMs)) return status;
  return now - updatedAtMs >= JOB_LEASE_MS ? "queued" : status;
}

export function canUpdateJob(
  current: StoredJobStatus,
  next: Exclude<StoredJobStatus, "queued">,
) {
  if (next === "running") return current === "queued" || current === "running";
  return current === "running";
}

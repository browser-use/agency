import assert from "node:assert/strict";
import test from "node:test";

import {
  canUpdateJob,
  ideaStatusForOutcome,
  JOB_LEASE_MS,
  jobLeaseWindow,
  MAX_CONCURRENT_JOBS,
  resolveTicketOutcome,
  visibleJobStatus,
} from "../lib/job-lifecycle.ts";

const now = Date.parse("2026-08-28T09:00:00Z");

test("requeues only expired running leases", () => {
  assert.equal(visibleJobStatus("running", "2026-08-28 08:00:00", now), "running");
  assert.equal(visibleJobStatus("running", "2026-08-28 03:00:00", now), "queued");
  assert.equal(visibleJobStatus("queued", "2026-08-27 00:00:00", now), "queued");
  assert.equal(jobLeaseWindow(), `-${JOB_LEASE_MS / 1000} seconds`);
  assert.equal(MAX_CONCURRENT_JOBS, 10);
});

test("separates agent completion from ticket completion", () => {
  assert.equal(resolveTicketOutcome("done"), "review");
  assert.equal(resolveTicketOutcome("done", "review"), "review");
  assert.equal(resolveTicketOutcome("done", "completed"), "completed");
  assert.equal(resolveTicketOutcome("failed", "completed"), "blocked");
  assert.equal(resolveTicketOutcome("running", "completed"), null);
  assert.equal(ideaStatusForOutcome("completed"), "done");
  assert.equal(ideaStatusForOutcome("review"), "new");
  assert.equal(ideaStatusForOutcome("blocked"), "new");
});

test("allows heartbeats but rejects terminal job resurrection", () => {
  assert.equal(canUpdateJob("queued", "running"), true);
  assert.equal(canUpdateJob("running", "running"), true);
  assert.equal(canUpdateJob("running", "done"), true);
  assert.equal(canUpdateJob("running", "failed"), true);
  assert.equal(canUpdateJob("queued", "done"), false);
  assert.equal(canUpdateJob("done", "running"), false);
  assert.equal(canUpdateJob("failed", "running"), false);
});

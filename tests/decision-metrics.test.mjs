import assert from "node:assert/strict";
import test from "node:test";

import { PARKED_DECISION_MS, summarizeDecisionMetrics } from "../lib/decision-metrics.ts";

test("summarizes accept, change, and reject decisions", () => {
  const metrics = summarizeDecisionMetrics([
    { decisionAction: "do", activeMs: 4_000, wallMs: 8_000 },
    { decisionAction: "change", activeMs: 10_000, wallMs: 18_000 },
    { decisionAction: "no", activeMs: 6_000, wallMs: 12_000 },
    { decisionAction: null, activeMs: 99_000, wallMs: 99_000 },
  ]);

  assert.deepEqual(metrics, {
    tracked: 3,
    accepted: 1,
    changed: 1,
    rejected: 1,
    parked: 0,
    medianActiveMs: 6_000,
    medianAcceptedActiveMs: 4_000,
    medianFastWallMs: 12_000,
    medianFirstActionMs: null,
    medianEstimateErrorMs: null,
  });
});

test("keeps parked time out of the fast wall-time median", () => {
  const metrics = summarizeDecisionMetrics([
    { decisionAction: "do", activeMs: 2_000, wallMs: 5_000 },
    { decisionAction: "no", activeMs: 8_000, wallMs: 15_000 },
    { decisionAction: "change", activeMs: 4_000, wallMs: PARKED_DECISION_MS + 1 },
  ]);

  assert.equal(metrics.parked, 1);
  assert.equal(metrics.medianActiveMs, 4_000);
  assert.equal(metrics.medianFastWallMs, 10_000);
});

test("excludes Agency maintenance from user decision metrics", () => {
  const metrics = summarizeDecisionMetrics([
    { decisionAction: "do", decisionSource: "user", activeMs: 3_000, wallMs: 5_000 },
    { decisionAction: "no", decisionSource: "agency", activeMs: 0, wallMs: 90_000_000 },
  ]);

  assert.deepEqual(metrics, {
    tracked: 1,
    accepted: 1,
    changed: 0,
    rejected: 0,
    parked: 0,
    medianActiveMs: 3_000,
    medianAcceptedActiveMs: 3_000,
    medianFastWallMs: 5_000,
    medianFirstActionMs: null,
    medianEstimateErrorMs: null,
  });
});

test("tracks time to any action and estimate error", () => {
  const metrics = summarizeDecisionMetrics([
    { decisionAction: "do", activeMs: 8_000, wallMs: 11_000, firstActionMs: 3_000, estimatedMs: 10_000 },
    { decisionAction: "do", activeMs: 14_000, wallMs: 18_000, firstActionMs: 5_000, estimatedMs: 11_000 },
    { decisionAction: null, activeMs: 1_000, wallMs: 2_000, firstActionMs: 1_000 },
  ]);

  assert.equal(metrics.tracked, 2);
  assert.equal(metrics.medianAcceptedActiveMs, 11_000);
  assert.equal(metrics.medianFirstActionMs, 3_000);
  assert.equal(metrics.medianEstimateErrorMs, 2_500);
});

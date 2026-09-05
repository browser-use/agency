import assert from "node:assert/strict";
import test from "node:test";

import { buildDecisionTimeModel, calibratedDecisionTime, estimateDecisionTime } from "../lib/decision-time.ts";

test("estimates one-line messages below broad PRs", () => {
  const message = estimateDecisionTime({
    headline: "Reply to Roman",
    category: "X reply",
    agentContext: JSON.stringify({ exactReply: "love this. what still sucks?" }),
  });
  const smallPr = estimateDecisionTime({
    headline: "Merge PR #1",
    cardHtml: "diff --git a/a.ts b/a.ts\n--- a/a.ts\n+++ b/a.ts\n-old\n+new",
  });
  const largePr = estimateDecisionTime({
    headline: "Merge PR #2",
    cardHtml: `diff --git a/a.ts b/a.ts\n${Array.from({ length: 320 }, (_, index) => index % 2 ? `+new ${index}` : `-old ${index}`).join("\n")}`,
  });

  assert.equal(message.kind, "message");
  assert.ok(message.estimatedMs < smallPr.estimatedMs);
  assert.ok(smallPr.estimatedMs < largePr.estimatedMs);
  assert.match(largePr.reason, /320 changed lines/);
});

test("calibrates explicit card estimates with the learned factor", () => {
  const card = {
    headline: "Send the reply",
    category: "Message",
    agentContext: JSON.stringify({ exactReply: "ship it", decisionEstimateSeconds: 6 }),
  };
  assert.equal(estimateDecisionTime(card).baselineMs, 6_000);

  const model = buildDecisionTimeModel(Array.from({ length: 20 }, () => ({ ...card, activeMs: 12_000 })));
  const calibrated = calibratedDecisionTime(card, model);
  assert.equal(calibrated.kind, "message");
  assert.ok(model.message.factor > 1);
  // Agents underestimate as much as the baselines do, so an explicit guess is calibrated too.
  assert.ok(calibrated.estimatedMs > 6_000);
  assert.equal(calibrated.learnedFactor, model.message.factor);
});

test("counts better in-card presentation as lower review effort", () => {
  const plain = estimateDecisionTime({
    headline: "Merge PR #3",
    cardHtml: `diff --git a/a.ts b/a.ts\n${Array.from({ length: 80 }, (_, index) => index % 2 ? `+new ${index}` : `-old ${index}`).join("\n")}`,
  });
  const easy = estimateDecisionTime({
    headline: "Merge PR #3",
    cardHtml: `<details><summary>Color diff</summary><pre class="diff-add">diff --git a/a.ts b/a.ts\n${Array.from({ length: 80 }, (_, index) => index % 2 ? `+new ${index}` : `-old ${index}`).join("\n")}</pre></details>`,
  });
  const external = estimateDecisionTime({
    headline: "Merge PR #3",
    cardHtml: `<button data-radar-action="open">Open PR</button>${"scope ".repeat(400)}`,
  });

  assert.ok(easy.estimatedMs < plain.estimatedMs);
  assert.ok(plain.estimatedMs < external.estimatedMs);
  assert.match(easy.reason, /expandable color-coded inline diff/);
});

test("accepts effort seconds as the baseline and calibrates it", () => {
  const card = {
    headline: "Send reply",
    category: "Message",
    agentContext: JSON.stringify({ effortSeconds: 20, effortReason: "inline exact reply" }),
  };
  const estimate = estimateDecisionTime(card);
  const calibrated = calibratedDecisionTime(card, { pr: { factor: 2, samples: 20 }, message: { factor: 2, samples: 20 }, visual: { factor: 2, samples: 20 }, task: { factor: 2, samples: 20 } });

  assert.equal(estimate.estimatedMs, 20_000);
  assert.equal(estimate.reason, "inline exact reply");
  assert.equal(calibrated.estimatedMs, 40_000);
});

test("does not shorten an explicit 30-minute PR review to the heuristic cap", () => {
  const card = {
    headline: "Review the API-key spend PR",
    decisionEstimateMs: 1_800_000,
    decisionEstimateReason: "The user estimated at least 30 minutes",
  };
  assert.equal(estimateDecisionTime(card).estimatedMs, 1_800_000);
  assert.equal(calibratedDecisionTime(card).estimatedMs, 1_800_000);
  const doubled = { pr: { factor: 2, samples: 20 }, message: { factor: 2, samples: 20 }, visual: { factor: 2, samples: 20 }, task: { factor: 2, samples: 20 } };
  assert.equal(calibratedDecisionTime(card, doubled).estimatedMs, 3_600_000);
});

test("keeps exact short and long context estimates without changing heuristics", () => {
  for (const effortSeconds of [3, 20, 1_800, 3_600]) {
    const card = { agentContext: JSON.stringify({ effortSeconds }) };
    assert.equal(estimateDecisionTime(card).estimatedMs, effortSeconds * 1_000);
    assert.equal(calibratedDecisionTime(card).estimatedMs, Math.max(5_000, effortSeconds * 1_000));
  }
  const fallback = estimateDecisionTime({ headline: "Merge PR #1", cardHtml: "large scope ".repeat(10_000) });
  assert.ok(fallback.estimatedMs <= 180_000);
});

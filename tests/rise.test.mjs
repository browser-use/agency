import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateRiseScore,
  compareByRise,
  normalizeRise,
  splitLegacyRiseScore,
} from "../lib/rise.ts";

test("calculates RISE from four 0–25 estimates", () => {
  const rise = normalizeRise({ reach: 22, impact: 24, strategicFit: 25, ease: 20 });
  assert.deepEqual(rise, { reach: 22, impact: 24, strategicFit: 25, ease: 20 });
  assert.equal(calculateRiseScore(rise), 91);
});

test("clamps components and requires an explicit estimate", () => {
  assert.deepEqual(
    normalizeRise({ reach: 30, impact: -2, strategicFit: 18.6, ease: 12.2 }),
    { reach: 25, impact: 0, strategicFit: 19, ease: 12 },
  );
  assert.equal(normalizeRise(undefined, undefined), null);
});

test("keeps old scalar estimates sortable without changing their total", () => {
  const rise = splitLegacyRiseScore(97);
  assert.deepEqual(rise, { reach: 25, impact: 24, strategicFit: 24, ease: 24 });
  assert.equal(calculateRiseScore(rise), 97);
});

test("sorts every lane by RISE and uses newest only as a tie-breaker", () => {
  const tasks = [
    { id: 8, score: 72 },
    { id: 3, score: 96 },
    { id: 12, score: 96 },
  ];
  assert.deepEqual(tasks.toSorted(compareByRise).map((task) => task.id), [12, 3, 8]);
});

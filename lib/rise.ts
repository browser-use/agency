export type RiseBreakdown = {
  reach: number;
  impact: number;
  strategicFit: number;
  ease: number;
};

const MAX_COMPONENT = 25;

function clampComponent(value: number) {
  return Math.max(0, Math.min(MAX_COMPONENT, Math.round(value)));
}

export function calculateRiseScore(rise: RiseBreakdown) {
  return rise.reach + rise.impact + rise.strategicFit + rise.ease;
}

export function splitLegacyRiseScore(value: number): RiseBreakdown {
  const score = Math.max(0, Math.min(100, Math.round(value)));
  const base = Math.floor(score / 4);
  const remainder = score % 4;
  return {
    reach: base + (remainder >= 1 ? 1 : 0),
    impact: base + (remainder >= 2 ? 1 : 0),
    strategicFit: base + (remainder >= 3 ? 1 : 0),
    ease: base,
  };
}

export function normalizeRise(
  rise: Partial<RiseBreakdown> | null | undefined,
  legacyScore?: number,
): RiseBreakdown | null {
  const values = rise
    ? [rise.reach, rise.impact, rise.strategicFit, rise.ease]
    : [];

  if (values.length === 4 && values.every((value) => Number.isFinite(value))) {
    return {
      reach: clampComponent(Number(rise?.reach)),
      impact: clampComponent(Number(rise?.impact)),
      strategicFit: clampComponent(Number(rise?.strategicFit)),
      ease: clampComponent(Number(rise?.ease)),
    };
  }

  if (Number.isFinite(legacyScore)) return splitLegacyRiseScore(Number(legacyScore));
  return null;
}

export function compareByRise<T extends { score: number; id: number }>(left: T, right: T) {
  return right.score - left.score || right.id - left.id;
}

/** What the user sees and scores by: impact on a 0-10 scale.
 *  Agents still estimate RISE 0-25 per component; impact is the half that decides
 *  whether a card is worth a click, so it is the only number on the card and the
 *  only thing a finished ticket is worth in points. */
export function impactPoints(card: { riseImpact?: number | null }) {
  const raw = Number(card.riseImpact ?? 0);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(10, Math.round(raw / 2.5)));
}

/** Sort by impact first, then by the full RISE total, then newest. */
export function compareByImpact<T extends { riseImpact?: number | null; score: number; id: number }>(left: T, right: T) {
  return impactPoints(right) - impactPoints(left) || right.score - left.score || right.id - left.id;
}

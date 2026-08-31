export const PARKED_DECISION_MS = 30 * 60 * 1000;

export type DecisionMetricRow = {
  decisionAction: string | null;
  decisionSource?: string | null;
  activeMs: number | null;
  wallMs: number | null;
  estimatedMs?: number | null;
  firstActionMs?: number | null;
};

export type DecisionMetrics = {
  tracked: number;
  accepted: number;
  changed: number;
  rejected: number;
  parked: number;
  medianActiveMs: number | null;
  medianAcceptedActiveMs: number | null;
  medianFastWallMs: number | null;
  medianFirstActionMs: number | null;
  medianEstimateErrorMs: number | null;
};

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

export function summarizeDecisionMetrics(rows: DecisionMetricRow[]): DecisionMetrics {
  const userRows = rows.filter((row) => row.decisionSource !== "agency");
  const decided = userRows.filter((row) => row.decisionAction);
  const activeTimes = decided
    .map((row) => Number(row.activeMs ?? 0))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const fastWallTimes = decided
    .map((row) => Number(row.wallMs ?? 0))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= PARKED_DECISION_MS);
  const acceptedTimes = decided
    .filter((row) => row.decisionAction === "do")
    .map((row) => Number(row.activeMs ?? 0))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const firstActionTimes = userRows
    .map((row) => Number(row.firstActionMs ?? NaN))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const estimateErrors = decided
    .map((row) => {
      const active = Number(row.activeMs ?? NaN);
      const estimate = Number(row.estimatedMs ?? NaN);
      return Number.isFinite(active) && Number.isFinite(estimate) ? Math.abs(active - estimate) : NaN;
    })
    .filter((value) => Number.isFinite(value));

  return {
    tracked: decided.length,
    accepted: decided.filter((row) => row.decisionAction === "do").length,
    changed: decided.filter((row) => row.decisionAction === "change").length,
    rejected: decided.filter((row) => row.decisionAction === "no").length,
    parked: decided.filter((row) => Number(row.wallMs ?? 0) > PARKED_DECISION_MS).length,
    medianActiveMs: median(activeTimes),
    medianAcceptedActiveMs: median(acceptedTimes),
    medianFastWallMs: median(fastWallTimes),
    medianFirstActionMs: median(firstActionTimes),
    medianEstimateErrorMs: median(estimateErrors),
  };
}

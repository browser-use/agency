import { ensureDatabase } from "../../../db";
import { summarizeDecisionMetrics } from "../../../lib/decision-metrics";
import { buildDecisionTimeModel, calibratedDecisionTime, type DecisionCardInput } from "../../../lib/decision-time";
import { jobLeaseWindow } from "../../../lib/job-lifecycle";

type IdeaRow = DecisionCardInput & Record<string, unknown>;
type DecisionHistoryRow = DecisionCardInput & {
  decisionAction: string | null;
  decisionSource: string | null;
  activeMs: number | null;
  wallMs: number | null;
  firstActionMs: number | null;
};

export async function GET() {
  const db = await ensureDatabase();
  const leaseWindow = jobLeaseWindow();
  const context = await db.prepare("SELECT text, created_at AS createdAt FROM contexts ORDER BY id DESC LIMIT 1").first();
  const ideas = await db.prepare(`
    SELECT
      i.id,
      i.version,
      i.project,
      i.category,
      i.headline,
      i.card_html AS cardHtml,
      i.agent_context AS agentContext,
      i.score,
      i.rise_reach AS riseReach,
      i.rise_impact AS riseImpact,
      i.rise_strategic_fit AS riseStrategicFit,
      i.rise_ease AS riseEase,
      i.decision_estimate_ms AS decisionEstimateMs,
      i.decision_estimate_reason AS decisionEstimateReason,
      i.source_label AS sourceLabel,
      i.source_url AS sourceUrl,
      i.agent_name AS agentName,
      i.dedupe_key AS dedupeKey,
      CASE
        WHEN j.status IN ('queued', 'running') THEN 'working'
        ELSE i.status
      END AS status,
      j.id AS jobId,
      CASE
        WHEN j.status = 'running' AND j.updated_at <= datetime('now', ?) THEN 'queued'
        ELSE j.status
      END AS jobStatus,
      j.result AS jobResult,
      j.button_label AS jobLabel,
      j.updated_at AS jobUpdatedAt,
      a.active_ms AS decisionActiveMs,
      a.wall_ms AS decisionWallMs,
      a.decision_action AS decisionAction
    FROM ideas i
    LEFT JOIN agent_jobs j ON j.id = (
      SELECT MAX(latest.id) FROM agent_jobs latest WHERE latest.idea_id = i.id
    )
    LEFT JOIN card_attention a ON a.idea_id = i.id AND a.idea_version = i.version AND a.decision_source = 'user'
    WHERE i.card_html != '' AND i.status IN ('new', 'working', 'done')
    ORDER BY i.score DESC, i.id DESC
  `).bind(leaseWindow).all<IdeaRow>();
  const jobs = await db.prepare(`
    WITH latest_jobs AS (
      SELECT job.*
      FROM agent_jobs job
      WHERE NOT EXISTS (
        SELECT 1 FROM agent_jobs newer
        WHERE newer.idea_id = job.idea_id AND newer.id > job.id
      )
    )
    SELECT
      CASE
        WHEN status = 'running' AND updated_at <= datetime('now', ?) THEN 'queued'
        ELSE status
      END AS status,
      COUNT(*) AS total
    FROM latest_jobs
    WHERE status IN ('queued', 'running')
    GROUP BY 1
  `).bind(leaseWindow).all<{ status: string; total: number }>();
  const decisionRows = await db.prepare(`
    SELECT
      a.decision_action AS decisionAction,
      a.decision_source AS decisionSource,
      a.active_ms AS activeMs,
      a.wall_ms AS wallMs,
      i.headline,
      i.category,
      i.source_label AS sourceLabel,
      i.card_html AS cardHtml,
      i.agent_context AS agentContext,
      i.decision_estimate_ms AS decisionEstimateMs,
      i.decision_estimate_reason AS decisionEstimateReason,
      (
        SELECT interaction.active_ms FROM card_interactions interaction
        WHERE interaction.idea_id = a.idea_id AND interaction.idea_version = a.idea_version
          AND (a.decided_at IS NULL OR interaction.created_at <= a.decided_at)
          AND interaction.action IN ('do', 'change', 'no', 'open', 'details')
        ORDER BY interaction.id ASC LIMIT 1
      ) AS firstActionMs
    FROM card_attention a
    JOIN ideas i ON i.id = a.idea_id
    WHERE a.decision_source = 'user' AND (
      (a.decided_at IS NOT NULL AND a.decided_at >= datetime('now', '-48 hours'))
      OR (a.decided_at IS NULL AND EXISTS (
        SELECT 1 FROM card_interactions recent_interaction
        WHERE recent_interaction.idea_id = a.idea_id
          AND recent_interaction.idea_version = a.idea_version
          AND recent_interaction.created_at >= datetime('now', '-48 hours')
      ))
    )
  `).all<DecisionHistoryRow>();
  const model = buildDecisionTimeModel(decisionRows.results.filter((row) => row.decisionAction));
  const enrichedIdeas = ideas.results.map((idea) => {
    const estimate = calibratedDecisionTime(idea, model);
    return {
      ...idea,
      decisionEstimateMs: estimate.estimatedMs,
      decisionEstimateReason: estimate.reason,
      decisionKind: estimate.kind,
    };
  });
  const metricRows = decisionRows.results.map((row) => ({
    ...row,
    estimatedMs: calibratedDecisionTime(row, model).estimatedMs,
  }));
  const jobCounts = Object.fromEntries(jobs.results.map((row) => [row.status, row.total]));
  return Response.json({
    context,
    ideas: enrichedIdeas,
    jobs: { queued: jobCounts.queued ?? 0, running: jobCounts.running ?? 0 },
    decisionMetrics: summarizeDecisionMetrics(metricRows),
  });
}

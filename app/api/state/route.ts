import { ensureDatabase } from "../../../db";
import { parseTopicRow } from "../../../lib/card-cluster";
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


const DECISION_HISTORY_SQL = `
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
  `;

// The 48-hour decision history (with card HTML) only feeds the calibration
// model; rebuilding it on every 5-second poll costs ~2 s. Cache for 30 s.
const DECISION_CACHE_MS = 30_000;
let decisionCache: { at: number; rows: { results: DecisionHistoryRow[] } } | null = null;

async function cachedDecisionRows(db: Awaited<ReturnType<typeof ensureDatabase>>) {
  if (decisionCache && Date.now() - decisionCache.at < DECISION_CACHE_MS) return decisionCache.rows;
  const rows = await db.prepare(DECISION_HISTORY_SQL).all<DecisionHistoryRow>();
  decisionCache = { at: Date.now(), rows };
  return rows;
}

export async function GET(request: Request) {
  const db = await ensureDatabase();
  const leaseWindow = jobLeaseWindow();
  const url = new URL(request.url);
  const requestedView = url.searchParams.get("view");
  const view = requestedView === "working" || requestedView === "done" ? requestedView : "new";
  const requestedCardId = Number(url.searchParams.get("card"));
  const selectedCardId = Number.isInteger(requestedCardId) && requestedCardId > 0 ? requestedCardId : null;
  // `light=1` omits card HTML (the Done list only needs headings); `only=<id>` returns one card.
  const light = url.searchParams.get("light") === "1";
  const requestedOnlyId = Number(url.searchParams.get("only"));
  const onlyId = Number.isInteger(requestedOnlyId) && requestedOnlyId > 0 ? requestedOnlyId : null;
  const context = await db.prepare("SELECT text, created_at AS createdAt FROM contexts ORDER BY id DESC LIMIT 1").first();
  const topicRows = await db.prepare("SELECT id, label, hint, keywords FROM topics ORDER BY position, created_at").all<{ id: string; label: string; hint: string; keywords: string }>();
  const ideas = await db.prepare(`
    WITH visible_ideas AS (
      SELECT
        i.id,
        i.version,
        i.project,
        i.category,
        i.headline,
        CASE WHEN ? THEN '' ELSE i.card_html END AS cardHtml,
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
        i.created_at AS createdAt,
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
        j.ticket_outcome AS jobOutcome,
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
    )
    SELECT * FROM visible_ideas
    WHERE (status = ? OR (? IS NOT NULL AND id = ?)) AND (? IS NULL OR id = ?)
    ORDER BY score DESC, id DESC
  `).bind(light && !onlyId ? 1 : 0, leaseWindow, view, selectedCardId, selectedCardId, onlyId, onlyId).all<IdeaRow>();
  const laneRows = await db.prepare(`
    WITH latest_jobs AS (
      SELECT job.*
      FROM agent_jobs job
      WHERE NOT EXISTS (
        SELECT 1 FROM agent_jobs newer
        WHERE newer.idea_id = job.idea_id AND newer.id > job.id
      )
    )
    SELECT
      CASE WHEN latest_jobs.status IN ('queued', 'running') THEN 'working' ELSE i.status END AS status,
      COUNT(*) AS total
    FROM ideas i
    LEFT JOIN latest_jobs ON latest_jobs.idea_id = i.id
    WHERE i.card_html != '' AND i.status IN ('new', 'working', 'done')
    GROUP BY 1
  `).all<{ status: string; total: number }>();
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
  const completionStats = await db.prepare(`
    WITH latest_jobs AS (
      SELECT job.*
      FROM agent_jobs job
      WHERE NOT EXISTS (
        SELECT 1 FROM agent_jobs newer
        WHERE newer.idea_id = job.idea_id AND newer.id > job.id
      )
    )
    SELECT
      SUM(CASE WHEN i.status = 'done' AND latest_jobs.ticket_outcome = 'completed' THEN 1 ELSE 0 END) AS verified,
      SUM(CASE WHEN i.status = 'done' AND latest_jobs.ticket_outcome = 'completed' THEN CAST(ROUND(i.rise_impact / 2.5) AS INTEGER) ELSE 0 END) AS points,
      SUM(CASE WHEN i.status = 'done' AND latest_jobs.ticket_outcome = 'completed' AND date(latest_jobs.updated_at, '-7 hours') = date('now', '-7 hours') THEN CAST(ROUND(i.rise_impact / 2.5) AS INTEGER) ELSE 0 END) AS pointsToday,
      SUM(CASE WHEN i.status = 'done' AND latest_jobs.ticket_outcome = 'completed' AND date(latest_jobs.updated_at, '-7 hours') = date('now', '-7 hours') THEN 1 ELSE 0 END) AS verifiedToday,
      SUM(CASE WHEN i.status = 'done' AND latest_jobs.ticket_outcome IS NULL THEN 1 ELSE 0 END) AS legacy,
      SUM(CASE WHEN latest_jobs.ticket_outcome = 'review' THEN 1 ELSE 0 END) AS reviewReady,
      SUM(CASE WHEN i.status = 'rejected' THEN 1 ELSE 0 END) AS dismissed
    FROM ideas i
    LEFT JOIN latest_jobs ON latest_jobs.idea_id = i.id
  `).first<{ verified: number | null; legacy: number | null; reviewReady: number | null; dismissed: number | null; points: number | null; pointsToday: number | null; verifiedToday: number | null }>();
  const decisionRows = await cachedDecisionRows(db);
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
  const laneCounts = Object.fromEntries(laneRows.results.map((row) => [row.status, row.total]));
  return Response.json({
    context,
    topics: topicRows.results.map(parseTopicRow),
    ideas: enrichedIdeas,
    laneCounts: {
      new: laneCounts.new ?? 0,
      working: laneCounts.working ?? 0,
      done: laneCounts.done ?? 0,
    },
    jobs: { queued: jobCounts.queued ?? 0, running: jobCounts.running ?? 0 },
    completionStats: {
      verified: completionStats?.verified ?? 0,
      legacy: completionStats?.legacy ?? 0,
      reviewReady: completionStats?.reviewReady ?? 0,
      dismissed: completionStats?.dismissed ?? 0,
      points: completionStats?.points ?? 0,
      pointsToday: completionStats?.pointsToday ?? 0,
      verifiedToday: completionStats?.verifiedToday ?? 0,
    },
    decisionMetrics: summarizeDecisionMetrics(metricRows),
  });
}

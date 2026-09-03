import { ensureDatabase } from "../../../db";
import { clusterForCard, parseTopicRow, type Topic } from "../../../lib/card-cluster";
import { impactPoints } from "../../../lib/rise";
import { PARKED_DECISION_MS } from "../../../lib/decision-metrics";

type DecisionRow = {
  ideaId: number;
  category: string;
  project: string;
  headline: string;
  decisionAction: "do" | "change" | "no";
  decisionLabel: string;
  activeMs: number | null;
  wallMs: number | null;
  decidedAt: string;
  score: number;
};
type CardRow = { id: number; category: string; project: string; headline: string; status: string; score: number; riseImpact: number; outcome: string | null; createdAt: string };

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = values.toSorted((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** Points come from finished work only: a verified completed ticket is worth its RISE score / 10.
 *  Do/Change/Skip are tracked as counts, not points, so the header and the Done list always agree. */
export const POINTS = { do: 3, change: 1, no: -1 } as const;

function emptyBucket() {
  return { do: 0, change: 0, no: 0, parked: 0, likedPoints: 0, medianActiveMs: null as number | null, medianDoMs: null as number | null, activeTimes: [] as number[], doTimes: [] as number[] };
}

export async function GET(request: Request) {
  const db = await ensureDatabase();
  const topicRows = await db.prepare("SELECT id, label, hint, keywords FROM topics ORDER BY position, created_at").all<{ id: string; label: string; hint: string; keywords: string }>();
  const topics: Topic[] = topicRows.results.map(parseTopicRow);
  const days = Math.max(1, Math.min(365, Number(new URL(request.url).searchParams.get("days")) || 30));
  const since = `-${days} days`;
  const decisions = await db.prepare(`
    SELECT a.idea_id AS ideaId, i.category, i.project, i.headline, a.decision_action AS decisionAction, a.decision_label AS decisionLabel,
           a.active_ms AS activeMs, a.wall_ms AS wallMs, a.decided_at AS decidedAt, i.score
    FROM card_attention a JOIN ideas i ON i.id = a.idea_id
    WHERE a.decision_source = 'user' AND a.decision_action IN ('do','change','no') AND a.decided_at >= datetime('now', ?)
    ORDER BY a.decided_at DESC
  `).bind(since).all<DecisionRow>();
  const cards = await db.prepare(`
    WITH latest_jobs AS (
      SELECT job.* FROM agent_jobs job
      WHERE NOT EXISTS (SELECT 1 FROM agent_jobs newer WHERE newer.idea_id = job.idea_id AND newer.id > job.id)
    )
    SELECT i.id, i.category, i.project, i.headline, i.status, i.score, i.rise_impact AS riseImpact, latest_jobs.ticket_outcome AS outcome, i.created_at AS createdAt
    FROM ideas i LEFT JOIN latest_jobs ON latest_jobs.idea_id = i.id
    WHERE i.card_html != '' AND i.status IN ('new','working','done','rejected')
  `).all<CardRow>();

  type ClusterBucket = ReturnType<typeof emptyBucket> & { open: number; done: number; rejected: number; donePoints: number };
  const byCluster: Record<string, ClusterBucket> = {};
  const bucketFor = (id: string) => (byCluster[id] ??= { ...emptyBucket(), open: 0, done: 0, rejected: 0, donePoints: 0 });
  for (const topic of topics) bucketFor(topic.id);
  const byDay = new Map<string, { do: number; change: number; no: number; points: number }>();
  const total = emptyBucket();
  for (const row of decisions.results) {
    const bucket = bucketFor(clusterForCard(row, topics));
    const active = Number(row.activeMs ?? 0);
    const wall = Number(row.wallMs ?? 0);
    for (const target of [bucket, total]) {
      target[row.decisionAction] += 1;
      target.likedPoints += POINTS[row.decisionAction];
      if (wall > PARKED_DECISION_MS) target.parked += 1;
      if (Number.isFinite(active) && active >= 0) {
        target.activeTimes.push(active);
        if (row.decisionAction === "do") target.doTimes.push(active);
      }
    }
    const day = row.decidedAt.slice(0, 10);
    const d = byDay.get(day) ?? { do: 0, change: 0, no: 0, points: 0 };
    d[row.decisionAction] += 1;
    d.points += POINTS[row.decisionAction];
    byDay.set(day, d);
  }
  let donePoints = 0;
  for (const card of cards.results) {
    const bucket = bucketFor(clusterForCard(card, topics));
    if (card.status === "done") {
      bucket.done += 1;
      if (card.outcome === "completed") {
        const pts = impactPoints(card);
        bucket.donePoints += pts;
        donePoints += pts;
      }
    } else if (card.status === "rejected") bucket.rejected += 1;
    else bucket.open += 1;
  }
  const finish = (b: ReturnType<typeof emptyBucket>) => {
    const { activeTimes, doTimes, ...rest } = b;
    return { ...rest, medianActiveMs: median(activeTimes), medianDoMs: median(doTimes), decided: b.do + b.change + b.no, doRate: b.do + b.change + b.no ? Math.round((100 * b.do) / (b.do + b.change + b.no)) : null };
  };
  const clusters = topics.map((c) => ({ id: c.id, label: c.label, hint: c.hint, ...finish(byCluster[c.id]), open: byCluster[c.id].open, done: byCluster[c.id].done, rejected: byCluster[c.id].rejected, donePoints: byCluster[c.id].donePoints }));
  // What he likes: category-level do-rate over the window (min 3 decisions), best and worst.
  const byCategory = new Map<string, { do: number; change: number; no: number }>();
  for (const row of decisions.results) {
    const key = row.category.split("·")[0].trim() || "Other";
    const c = byCategory.get(key) ?? { do: 0, change: 0, no: 0 };
    c[row.decisionAction] += 1;
    byCategory.set(key, c);
  }
  const categories = [...byCategory.entries()]
    .map(([name, c]) => ({ name, ...c, decided: c.do + c.change + c.no, doRate: Math.round((100 * c.do) / (c.do + c.change + c.no)) }))
    .filter((c) => c.decided >= 3)
    .toSorted((a, b) => b.doRate - a.doRate || b.decided - a.decided);
  const recent = decisions.results.slice(0, 40).map((r) => ({ ideaId: r.ideaId, headline: r.headline, action: r.decisionAction, activeMs: r.activeMs, decidedAt: r.decidedAt, cluster: clusterForCard(r, topics) }));
  return Response.json({
    days,
    total: { ...finish(total), likedPoints: total.likedPoints, donePoints, points: donePoints },
    clusters,
    categories,
    days_series: [...byDay.entries()].toSorted(([a], [b]) => (a < b ? -1 : 1)).map(([day, d]) => ({ day, ...d })),
    recent,
  });
}

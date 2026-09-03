import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../db";
import { estimateDecisionTime } from "../../../lib/decision-time";
import { calculateRiseScore, normalizeRise, type RiseBreakdown } from "../../../lib/rise";

type NewCard = {
  project?: string;
  category?: string;
  headline?: string;
  cardHtml?: string;
  agentContext?: string | Record<string, unknown>;
  score?: number;
  rise?: Partial<RiseBreakdown>;
  effortSeconds?: number;
  effortReason?: string;
  decisionEstimateSeconds?: number;
  decisionEstimateReason?: string;
  sourceLabel?: string;
  sourceUrl?: string;
  agentName?: string;
  dedupeKey?: string;
};

function canIngest(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) return origin === new URL(request.url).origin;
  const url = new URL(request.url);
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (loopback && request.headers.get("x-radar-local-agent") === "1") return true;
  const expected = (env as unknown as { RADAR_AGENT_KEY?: string }).RADAR_AGENT_KEY;
  return Boolean(expected) && request.headers.get("x-radar-agent-key") === expected;
}

function unsafeHtml(html: string) {
  return /<\s*(script|iframe|object|embed|form|meta|base|link|svg|math|a)\b/i.test(html)
    || /\son[a-z]+\s*=/i.test(html)
    || /javascript\s*:/i.test(html)
    || /@import\b/i.test(html)
    || /url\s*\(\s*["']?(?:https?:)?\/\//i.test(html)
    || /\s(?:src|poster|srcset)\s*=\s*["'](?:https?:)?\/\//i.test(html);
}

export async function POST(request: Request) {
  if (!canIngest(request)) return Response.json({ error: "Missing agent key" }, { status: 401 });
  const card = (await request.json()) as NewCard;
  const project = card.project?.trim() ?? "";
  const category = card.category?.trim() ?? "";
  const headline = card.headline?.trim() ?? "";
  const cardHtml = card.cardHtml?.trim() ?? "";
  const dedupeKey = card.dedupeKey?.trim() ?? "";
  if (!project || !category || !headline || !dedupeKey || cardHtml.length < 80 || cardHtml.length > 100_000) {
    return Response.json({ error: "Card needs project, category, headline, dedupeKey, and 80–100000 characters of HTML." }, { status: 400 });
  }
  if (unsafeHtml(cardHtml)) return Response.json({ error: "Card HTML contains an unsafe element or attribute." }, { status: 400 });
  if (!/data-radar-action\s*=\s*["']do["']/i.test(cardHtml)) {
    return Response.json({ error: "Every card needs a meaningful next-step button. Open or See proof does not count." }, { status: 400 });
  }
  const context = typeof card.agentContext === "string" ? card.agentContext : JSON.stringify(card.agentContext ?? {});
  if (context.length > 100_000) return Response.json({ error: "Agent context is too large." }, { status: 400 });
  const rise = normalizeRise(card.rise, card.score);
  if (!rise) {
    return Response.json({ error: "Every card needs a RISE estimate: reach, impact, strategicFit, and ease from 0–25." }, { status: 400 });
  }
  const score = calculateRiseScore(rise);
  const decisionEstimate = estimateDecisionTime({
    category,
    headline,
    cardHtml,
    agentContext: context,
    decisionEstimateMs: Number(card.effortSeconds ?? card.decisionEstimateSeconds ?? 0) * 1_000,
    decisionEstimateReason: card.effortReason ?? card.decisionEstimateReason,
  });
  const db = await ensureDatabase();
  const result = await db.prepare("INSERT INTO ideas (project, category, headline, why_matters, impact, finished_work, primary_action, secondary_action, external_action, card_html, agent_context, score, rise_reach, rise_impact, rise_strategic_fit, rise_ease, decision_estimate_ms, decision_estimate_reason, source_label, source_url, agent_name, preview_kind, preview_title, preview_body, preview_asset, dedupe_key) VALUES (?, ?, ?, '', '', '', '', '', '', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'html', '', '', '', ?) ON CONFLICT(dedupe_key) DO UPDATE SET project=excluded.project, category=excluded.category, headline=excluded.headline, card_html=excluded.card_html, agent_context=excluded.agent_context, score=excluded.score, rise_reach=excluded.rise_reach, rise_impact=excluded.rise_impact, rise_strategic_fit=excluded.rise_strategic_fit, rise_ease=excluded.rise_ease, decision_estimate_ms=excluded.decision_estimate_ms, decision_estimate_reason=excluded.decision_estimate_reason, source_label=excluded.source_label, source_url=excluded.source_url, agent_name=excluded.agent_name, version=ideas.version+1, status='new', created_at=CURRENT_TIMESTAMP RETURNING id, version")
    .bind(project, category, headline, cardHtml, context, score, rise.reach, rise.impact, rise.strategicFit, rise.ease, decisionEstimate.estimatedMs, decisionEstimate.reason, card.sourceLabel?.trim() ?? "", card.sourceUrl?.trim() ?? "", card.agentName?.trim() ?? "Agency", dedupeKey).first();
  // A replacement card answers a blocked job: mark that job as review so the
  // startup reconcile does not drag the fresh card back to Working forever.
  const replacedId = (result as { id?: number } | null)?.id;
  if (replacedId) {
    await db.prepare(`
      UPDATE agent_jobs SET ticket_outcome = 'review', updated_at = CURRENT_TIMESTAMP
      WHERE ticket_outcome = 'blocked' AND status = 'failed'
        AND id = (SELECT MAX(id) FROM agent_jobs WHERE idea_id = ?)
    `).bind(replacedId).run();
  }
  return Response.json({ ok: true, idea: result }, { status: 201 });
}

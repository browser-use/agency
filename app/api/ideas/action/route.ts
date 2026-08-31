import { ensureDatabase } from "../../../../db";

type CardAction = {
  id?: number;
  version?: number;
  status?: "new" | "working" | "done";
  action?: "do" | "change" | "no";
  label?: string;
  prompt?: string;
  note?: string;
  activeMs?: number;
};

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(request.url).origin) return Response.json({ error: "Blocked origin" }, { status: 403 });
  const payload = (await request.json()) as CardAction;
  if (!payload.id || !Number.isInteger(payload.version) || !["new", "working", "done"].includes(payload.status ?? "") || !["do", "change", "no"].includes(payload.action ?? "")) return Response.json({ error: "Invalid action" }, { status: 400 });
  const label = payload.label?.trim().slice(0, 120) || payload.action || "Action";
  const instruction = payload.prompt?.trim().slice(0, 5000) ?? "";
  const note = payload.note?.trim().slice(0, 5000) ?? "";
  const activeMs = Math.max(0, Math.min(15_000, Math.round(Number(payload.activeMs ?? 0))));
  const db = await ensureDatabase();
  const idea = await db.prepare("SELECT id, version, status, project, category, headline, card_html AS cardHtml, agent_context AS agentContext, score, rise_reach AS riseReach, rise_impact AS riseImpact, rise_strategic_fit AS riseStrategicFit, rise_ease AS riseEase, decision_estimate_ms AS decisionEstimateMs, decision_estimate_reason AS decisionEstimateReason, source_label AS sourceLabel, source_url AS sourceUrl, dedupe_key AS dedupeKey FROM ideas WHERE id = ? AND version = ? AND status = ?").bind(payload.id, payload.version, payload.status).first<{ id: number; version: number } & Record<string, unknown>>();
  if (!idea) {
    const current = await db.prepare("SELECT id FROM ideas WHERE id = ?").bind(payload.id).first();
    return current
      ? Response.json({ error: "Card changed while you were reading" }, { status: 409 })
      : Response.json({ error: "Card not found" }, { status: 404 });
  }
  if (payload.action !== "no") {
    const inFlight = await db.prepare("SELECT id FROM agent_jobs WHERE idea_id = ? AND status IN ('queued', 'running') ORDER BY id DESC LIMIT 1").bind(payload.id).first<{ id: number }>();
    if (inFlight) {
      return Response.json({ error: "Agency is already working on this card", jobId: inFlight.id }, { status: 409 });
    }
  }
  const status = payload.action === "no" ? "rejected" : "working";
  const decisionUpdates = [
    db.prepare("INSERT INTO card_attention (idea_id, idea_version, view_count) VALUES (?, ?, 0) ON CONFLICT(idea_id, idea_version) DO NOTHING").bind(payload.id, idea.version),
    db.prepare("UPDATE card_attention SET active_ms = active_ms + ?, decision_action = CASE WHEN decided_at IS NULL THEN ? ELSE decision_action END, decision_label = CASE WHEN decided_at IS NULL THEN ? ELSE decision_label END, decided_at = COALESCE(decided_at, CURRENT_TIMESTAMP), wall_ms = COALESCE(wall_ms, MAX(0, CAST((julianday(CURRENT_TIMESTAMP) - julianday(first_seen_at)) * 86400000 AS INTEGER))), last_seen_at = CURRENT_TIMESTAMP WHERE idea_id = ? AND idea_version = ?").bind(activeMs, payload.action, label, payload.id, idea.version),
    db.prepare("INSERT INTO card_interactions (idea_id, idea_version, action, label, active_ms, wall_ms) SELECT idea_id, idea_version, ?, ?, active_ms, MAX(0, CAST((julianday(CURRENT_TIMESTAMP) - julianday(first_seen_at)) * 86400000 AS INTEGER)) FROM card_attention WHERE idea_id = ? AND idea_version = ?").bind(payload.action, label, payload.id, idea.version),
    db.prepare("UPDATE ideas SET status = ? WHERE id = ?").bind(status, payload.id),
    db.prepare("INSERT INTO feedback (idea_id, decision, note) VALUES (?, ?, ?)").bind(payload.id, payload.action, note || instruction || label),
  ];
  if (payload.action === "no") {
    await db.batch(decisionUpdates);
    return Response.json({ ok: true, status });
  }
  const cardContext = JSON.stringify({ idea, click: { action: payload.action, label, instruction, note } });
  const job = await db.prepare("INSERT INTO agent_jobs (idea_id, action, button_label, instruction, user_feedback, card_context) VALUES (?, ?, ?, ?, ?, ?) RETURNING id")
    .bind(payload.id, payload.action, label, instruction, note, cardContext).first();
  await db.batch(decisionUpdates);
  return Response.json({ ok: true, jobId: job?.id, status });
}

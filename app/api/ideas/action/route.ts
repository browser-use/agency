import { ensureDatabase } from "../../../../db";
import { getAgentSettings } from "../../../../lib/agent-settings";
import {
  AgentInputError,
  expectedRevisionMatches,
  parseStoredSelectionOrThrow,
  readJsonObject,
  resolveAgentConfig,
} from "../../../../lib/agent-models";

type CardAction = {
  id: number;
  version: number;
  status: "new" | "working" | "done";
  action: "do" | "change" | "no";
  label: string;
  instruction: string;
  note: string;
  activeMs: number;
  expectedAgentRevision?: number;
  expectedSettingsRevision?: number;
};

function parseAction(payload: Record<string, unknown>): CardAction {
  const id = Number(payload.id);
  const version = Number(payload.version);
  if (!Number.isInteger(id) || id < 1 || !Number.isInteger(version) || version < 1
    || !["new", "working", "done"].includes(String(payload.status))
    || !["do", "change", "no"].includes(String(payload.action))) {
    throw new AgentInputError("Invalid action");
  }
  let expectedAgentRevision: number | undefined;
  if (payload.expectedAgentRevision !== undefined) {
    expectedAgentRevision = Number(payload.expectedAgentRevision);
    if (!Number.isInteger(expectedAgentRevision) || expectedAgentRevision < 0) {
      throw new AgentInputError("expectedAgentRevision must be a non-negative integer.");
    }
  }
  let expectedSettingsRevision: number | undefined;
  if (payload.expectedSettingsRevision !== undefined) {
    expectedSettingsRevision = Number(payload.expectedSettingsRevision);
    if (!Number.isInteger(expectedSettingsRevision) || expectedSettingsRevision < 0) {
      throw new AgentInputError("expectedSettingsRevision must be a non-negative integer.");
    }
  }
  const action = payload.action as CardAction["action"];
  return {
    id,
    version,
    status: payload.status as CardAction["status"],
    action,
    label: typeof payload.label === "string" ? payload.label.trim().slice(0, 120) || action : action,
    instruction: typeof payload.prompt === "string" ? payload.prompt.trim().slice(0, 5000) : "",
    note: typeof payload.note === "string" ? payload.note.trim().slice(0, 5000) : "",
    activeMs: Math.max(0, Math.min(15_000, Math.round(Number(payload.activeMs ?? 0) || 0))),
    expectedAgentRevision,
    expectedSettingsRevision,
  };
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Blocked origin" }, { status: 403 });
  try {
    const payload = parseAction(await readJsonObject(request));
    const db = await ensureDatabase();
    const idea = await db.prepare(`
      SELECT id, version, status, project, category, headline, card_html AS cardHtml,
        agent_context AS agentContext, agent_selection AS storedAgentSelection,
        agent_revision AS agentRevision, score, rise_reach AS riseReach,
        rise_impact AS riseImpact, rise_strategic_fit AS riseStrategicFit,
        rise_ease AS riseEase, decision_estimate_ms AS decisionEstimateMs,
        decision_estimate_reason AS decisionEstimateReason, source_label AS sourceLabel,
        source_url AS sourceUrl, dedupe_key AS dedupeKey
      FROM ideas WHERE id = ? AND version = ? AND status = ?
    `).bind(payload.id, payload.version, payload.status).first<{
      id: number;
      version: number;
      agentRevision: number;
      storedAgentSelection: string | null;
    } & Record<string, unknown>>();
    if (!idea) {
      const current = await db.prepare("SELECT id FROM ideas WHERE id = ?").bind(payload.id).first();
      return current
        ? Response.json({ error: "Card changed while you were reading" }, { status: 409 })
        : Response.json({ error: "Card not found" }, { status: 404 });
    }

    if (payload.action === "no") {
      const updated = await db.prepare(`
        UPDATE ideas SET status = 'rejected'
        WHERE id = ? AND version = ? AND status = ?
        RETURNING id
      `).bind(payload.id, payload.version, payload.status).first();
      if (!updated) return Response.json({ error: "Card changed while you were reading" }, { status: 409 });
      await db.batch([
        db.prepare("INSERT INTO card_attention (idea_id, idea_version, view_count) VALUES (?, ?, 0) ON CONFLICT(idea_id, idea_version) DO NOTHING").bind(payload.id, idea.version),
        db.prepare("UPDATE card_attention SET active_ms = active_ms + ?, decision_action = CASE WHEN decided_at IS NULL THEN ? ELSE decision_action END, decision_label = CASE WHEN decided_at IS NULL THEN ? ELSE decision_label END, decided_at = COALESCE(decided_at, CURRENT_TIMESTAMP), wall_ms = COALESCE(wall_ms, MAX(0, CAST((julianday(CURRENT_TIMESTAMP) - julianday(first_seen_at)) * 86400000 AS INTEGER))), last_seen_at = CURRENT_TIMESTAMP WHERE idea_id = ? AND idea_version = ?").bind(payload.activeMs, payload.action, payload.label, payload.id, idea.version),
        db.prepare("INSERT INTO card_interactions (idea_id, idea_version, action, label, active_ms, wall_ms) SELECT idea_id, idea_version, ?, ?, active_ms, MAX(0, CAST((julianday(CURRENT_TIMESTAMP) - julianday(first_seen_at)) * 86400000 AS INTEGER)) FROM card_attention WHERE idea_id = ? AND idea_version = ?").bind(payload.action, payload.label, payload.id, idea.version),
        db.prepare("INSERT INTO feedback (idea_id, decision, note) VALUES (?, ?, ?)").bind(payload.id, payload.action, payload.note || payload.instruction || payload.label),
      ]);
      return Response.json({ ok: true, status: "rejected" });
    }

    if (!expectedRevisionMatches(payload.expectedAgentRevision, idea.agentRevision)) {
      return Response.json({ error: "Card model changed while you were reading", agentRevision: idea.agentRevision }, { status: 409 });
    }
    const settings = await getAgentSettings(db);
    if (!expectedRevisionMatches(payload.expectedSettingsRevision, settings.revision)) {
      return Response.json({ error: "Agent settings changed while you were reading", settingsRevision: settings.revision }, { status: 409 });
    }
    const { storedAgentSelection, ...cardFields } = idea;
    const agentSelection = parseStoredSelectionOrThrow(storedAgentSelection, "Card selection");
    let agentConfig;
    try {
      agentConfig = resolveAgentConfig(settings, "execution", agentSelection, idea.agentRevision);
    } catch (error) {
      if (error instanceof AgentInputError) return Response.json({ error: error.message }, { status: 409 });
      throw error;
    }
    const publicIdea = { ...cardFields, agentSelection };
    const cardContext = JSON.stringify({
      idea: publicIdea,
      agentConfig,
      click: {
        action: payload.action,
        label: payload.label,
        instruction: payload.instruction,
        note: payload.note,
      },
    });
    const job = await db.prepare(`
      INSERT INTO agent_jobs (
        idea_id, action, button_label, instruction, user_feedback, card_context, agent_config
      )
      SELECT id, ?, ?, ?, ?, ?, ?
      FROM ideas
      WHERE id = ? AND version = ? AND status = ? AND agent_revision = ?
        AND (? IS NULL OR (SELECT revision FROM agent_settings WHERE id = 1) = ?)
        AND NOT EXISTS (
          SELECT 1 FROM agent_jobs
          WHERE idea_id = ideas.id AND status IN ('queued', 'running')
        )
      RETURNING id
    `).bind(
      payload.action,
      payload.label,
      payload.instruction,
      payload.note,
      cardContext,
      agentConfig ? JSON.stringify(agentConfig) : null,
      payload.id,
      payload.version,
      payload.status,
      idea.agentRevision,
      payload.expectedSettingsRevision ?? null,
      payload.expectedSettingsRevision ?? null,
    ).first<{ id: number }>();
    if (!job) {
      const currentSettings = await getAgentSettings(db);
      const current = await db.prepare("SELECT version, status, agent_revision AS agentRevision FROM ideas WHERE id = ?")
        .bind(payload.id).first<{ version: number; status: string; agentRevision: number }>();
      const inFlight = await db.prepare("SELECT id FROM agent_jobs WHERE idea_id = ? AND status IN ('queued', 'running') ORDER BY id DESC LIMIT 1")
        .bind(payload.id).first<{ id: number }>();
      if (inFlight) return Response.json({ error: "Agency is already working on this card", jobId: inFlight.id }, { status: 409 });
      return Response.json({
        error: currentSettings.revision !== settings.revision
          ? "Agent settings changed while you were reading"
          : "Card changed while you were reading",
        settingsRevision: currentSettings.revision,
        agentRevision: current?.agentRevision,
      }, { status: 409 });
    }
    await db.batch([
      db.prepare("INSERT INTO card_attention (idea_id, idea_version, view_count) VALUES (?, ?, 0) ON CONFLICT(idea_id, idea_version) DO NOTHING").bind(payload.id, idea.version),
      db.prepare("UPDATE card_attention SET active_ms = active_ms + ?, decision_action = CASE WHEN decided_at IS NULL THEN ? ELSE decision_action END, decision_label = CASE WHEN decided_at IS NULL THEN ? ELSE decision_label END, decided_at = COALESCE(decided_at, CURRENT_TIMESTAMP), wall_ms = COALESCE(wall_ms, MAX(0, CAST((julianday(CURRENT_TIMESTAMP) - julianday(first_seen_at)) * 86400000 AS INTEGER))), last_seen_at = CURRENT_TIMESTAMP WHERE idea_id = ? AND idea_version = ?").bind(payload.activeMs, payload.action, payload.label, payload.id, idea.version),
      db.prepare("INSERT INTO card_interactions (idea_id, idea_version, action, label, active_ms, wall_ms) SELECT idea_id, idea_version, ?, ?, active_ms, MAX(0, CAST((julianday(CURRENT_TIMESTAMP) - julianday(first_seen_at)) * 86400000 AS INTEGER)) FROM card_attention WHERE idea_id = ? AND idea_version = ?").bind(payload.action, payload.label, payload.id, idea.version),
      db.prepare("UPDATE ideas SET status = 'working' WHERE id = ? AND version = ? AND agent_revision = ?").bind(payload.id, payload.version, idea.agentRevision),
      db.prepare("INSERT INTO feedback (idea_id, decision, note) VALUES (?, ?, ?)").bind(payload.id, payload.action, payload.note || payload.instruction || payload.label),
    ]);
    return Response.json({ ok: true, jobId: job.id, status: "working" });
  } catch (error) {
    if (error instanceof AgentInputError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

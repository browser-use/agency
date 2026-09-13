import { ensureDatabase } from "../../../../db";
import { getAgentSettings } from "../../../../lib/agent-settings";
import {
  AgentInputError,
  parseNullableAgentSelection,
  parseStoredSelection,
  readJsonObject,
  tryResolveAgentConfig,
  validateAgentSelection,
} from "../../../../lib/agent-models";

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Blocked origin" }, { status: 403 });
  try {
    const payload = await readJsonObject(request);
    const id = Number(payload.id);
    const version = Number(payload.version);
    const expectedAgentRevision = Number(payload.expectedAgentRevision);
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(version) || version < 1) {
      throw new AgentInputError("id and version must be positive integers.");
    }
    if (!Number.isInteger(expectedAgentRevision) || expectedAgentRevision < 0) {
      throw new AgentInputError("expectedAgentRevision must be a non-negative integer.");
    }
    if (!("selection" in payload)) throw new AgentInputError("selection is required.");
    const selection = parseNullableAgentSelection(payload.selection);
    const db = await ensureDatabase();
    const settings = await getAgentSettings(db);
    if (selection) validateAgentSelection(selection, settings.models, "selection");
    const updated = await db.prepare(`
      UPDATE ideas
      SET agent_selection = ?, agent_revision = agent_revision + 1
      WHERE id = ? AND version = ? AND status = 'new' AND agent_revision = ?
        AND NOT EXISTS (
          SELECT 1 FROM agent_jobs
          WHERE idea_id = ideas.id AND status IN ('queued', 'running')
        )
      RETURNING agent_selection AS agentSelection, agent_revision AS agentRevision
    `).bind(
      selection ? JSON.stringify(selection) : null,
      id,
      version,
      expectedAgentRevision,
    ).first<{ agentSelection: string | null; agentRevision: number }>();
    if (!updated) {
      const current = await db.prepare(`
        SELECT id, version, status, agent_revision AS agentRevision,
          EXISTS(SELECT 1 FROM agent_jobs WHERE idea_id = ideas.id AND status IN ('queued', 'running')) AS inFlight
        FROM ideas WHERE id = ?
      `).bind(id).first<{ id: number; version: number; status: string; agentRevision: number; inFlight: number }>();
      if (!current) return Response.json({ error: "Card not found" }, { status: 404 });
      return Response.json({
        error: current.inFlight ? "Agency is already working on this card" : "Card model changed while you were editing",
        agentRevision: current.agentRevision,
      }, { status: 409 });
    }
    const latestSettings = await getAgentSettings(db);
    const savedSelection = parseStoredSelection(updated.agentSelection);
    return Response.json({
      ok: true,
      agentSelection: savedSelection,
      agentRevision: updated.agentRevision,
      agentConfig: tryResolveAgentConfig(latestSettings, "execution", savedSelection, updated.agentRevision),
      settingsRevision: latestSettings.revision,
    });
  } catch (error) {
    if (error instanceof AgentInputError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

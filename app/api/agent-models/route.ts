import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../db";
import { getAgentSettings, saveAgentCatalog } from "../../../lib/agent-settings";
import {
  AgentInputError,
  parseAgentCatalog,
  parseNullableAgentSelection,
  readJsonObject,
  validateAgentSelection,
} from "../../../lib/agent-models";

function canUpdateCatalog(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) return origin === new URL(request.url).origin;
  const url = new URL(request.url);
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (loopback && request.headers.get("x-radar-local-agent") === "1") return true;
  const expected = (env as unknown as { RADAR_AGENT_KEY?: string }).RADAR_AGENT_KEY;
  return Boolean(expected) && request.headers.get("x-radar-agent-key") === expected;
}

export async function POST(request: Request) {
  if (!canUpdateCatalog(request)) return Response.json({ error: "Missing agent key" }, { status: 401 });
  try {
    const payload = await readJsonObject(request);
    if (!("models" in payload) || !("runnerDefault" in payload)) {
      throw new AgentInputError("models and runnerDefault are required.");
    }
    const models = parseAgentCatalog(payload.models);
    const runnerDefault = parseNullableAgentSelection(payload.runnerDefault, "runnerDefault");
    if (runnerDefault) validateAgentSelection(runnerDefault, models, "runnerDefault");
    let expectedRevision: number | undefined;
    if (payload.expectedRevision !== undefined) {
      if (!Number.isInteger(payload.expectedRevision) || Number(payload.expectedRevision) < 0) {
        throw new AgentInputError("expectedRevision must be a non-negative integer.");
      }
      expectedRevision = Number(payload.expectedRevision);
    }
    const db = await ensureDatabase();
    const saved = await saveAgentCatalog(db, models, runnerDefault, expectedRevision);
    if (!saved) {
      const latest = await getAgentSettings(db);
      return Response.json({ error: "Agent settings changed before the catalog was saved.", settingsRevision: latest.revision }, { status: 409 });
    }
    return Response.json({
      ok: true,
      models: saved.models,
      runnerDefault: saved.runnerDefault,
      settingsRevision: saved.revision,
    });
  } catch (error) {
    if (error instanceof AgentInputError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

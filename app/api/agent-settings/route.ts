import { ensureDatabase } from "../../../db";
import { getAgentSettings, parseSettingsProfiles, saveAgentSettings } from "../../../lib/agent-settings";
import { AgentInputError, readJsonObject, validateAgentSelection } from "../../../lib/agent-models";

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function GET() {
  const db = await ensureDatabase();
  return Response.json(await getAgentSettings(db));
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Blocked origin" }, { status: 403 });
  try {
    const payload = await readJsonObject(request);
    const update = parseSettingsProfiles(payload);
    const db = await ensureDatabase();
    const current = await getAgentSettings(db);
    if (update.discovery) validateAgentSelection(update.discovery, current.models, "discovery");
    if (update.execution) validateAgentSelection(update.execution, current.models, "execution");
    const saved = await saveAgentSettings(
      db,
      update.expectedRevision,
      update.discovery,
      update.execution,
    );
    if (!saved) {
      const latest = await getAgentSettings(db);
      return Response.json({ error: "Agent settings changed while you were editing.", settings: latest }, { status: 409 });
    }
    return Response.json(saved);
  } catch (error) {
    if (error instanceof AgentInputError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

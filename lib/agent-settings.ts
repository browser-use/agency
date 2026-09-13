import type { ensureDatabase } from "../db";
import {
  AgentInputError,
  parseAgentCatalog,
  parseNullableAgentSelection,
  parseStoredSelectionOrThrow,
  type AgentModel,
  type AgentSelection,
  type AgentSettings,
} from "./agent-models.ts";

type AgencyDatabase = Awaited<ReturnType<typeof ensureDatabase>>;

type SettingsRow = {
  revision: number;
  models: string;
  runnerDefault: string | null;
  discovery: string | null;
  execution: string | null;
};

function parseStoredModels(value: string): AgentModel[] {
  try {
    return parseAgentCatalog(JSON.parse(value));
  } catch {
    return [];
  }
}

function settingsFromRow(row: SettingsRow | null): AgentSettings {
  if (!row) return { revision: 0, models: [], runnerDefault: null, discovery: null, execution: null };
  return {
    revision: row.revision,
    models: parseStoredModels(row.models),
    runnerDefault: parseStoredSelectionOrThrow(row.runnerDefault, "Stored runner default"),
    discovery: parseStoredSelectionOrThrow(row.discovery, "Stored discovery default"),
    execution: parseStoredSelectionOrThrow(row.execution, "Stored execution default"),
  };
}

export async function getAgentSettings(db: AgencyDatabase) {
  const row = await db.prepare(`
    SELECT revision, models, runner_default AS runnerDefault,
           discovery, execution
    FROM agent_settings WHERE id = 1
  `).first<SettingsRow>();
  return settingsFromRow(row);
}

export async function saveAgentSettings(
  db: AgencyDatabase,
  expectedRevision: number,
  discovery: AgentSelection | null,
  execution: AgentSelection | null,
) {
  const updated = await db.prepare(`
    UPDATE agent_settings
    SET discovery = ?, execution = ?, revision = revision + 1
    WHERE id = 1 AND revision = ?
    RETURNING revision
  `).bind(
    discovery ? JSON.stringify(discovery) : null,
    execution ? JSON.stringify(execution) : null,
    expectedRevision,
  ).first<{ revision: number }>();
  if (!updated) return null;
  return getAgentSettings(db);
}

export async function saveAgentCatalog(
  db: AgencyDatabase,
  models: AgentModel[],
  runnerDefault: AgentSelection | null,
  expectedRevision?: number,
) {
  const modelsJson = JSON.stringify(models);
  const runnerDefaultJson = runnerDefault ? JSON.stringify(runnerDefault) : null;
  const updated = await db.prepare(`
    UPDATE agent_settings
    SET models = ?, runner_default = ?,
        revision = revision + CASE
          WHEN models != ? OR COALESCE(runner_default, '') != COALESCE(?, '') THEN 1
          ELSE 0
        END
    WHERE id = 1
      AND (? IS NULL OR revision = ?)
    RETURNING revision, models, runner_default AS runnerDefault, discovery, execution
  `).bind(
    modelsJson,
    runnerDefaultJson,
    modelsJson,
    runnerDefaultJson,
    expectedRevision ?? null,
    expectedRevision ?? null,
  ).first<SettingsRow>();
  return updated ? settingsFromRow(updated) : null;
}

export function parseSettingsProfiles(payload: Record<string, unknown>) {
  if (!Number.isInteger(payload.expectedRevision) || Number(payload.expectedRevision) < 0) {
    throw new AgentInputError("expectedRevision must be a non-negative integer.");
  }
  if (!("discovery" in payload) || !("execution" in payload)) {
    throw new AgentInputError("discovery and execution are required.");
  }
  return {
    expectedRevision: Number(payload.expectedRevision),
    discovery: parseNullableAgentSelection(payload.discovery, "discovery"),
    execution: parseNullableAgentSelection(payload.execution, "execution"),
  };
}

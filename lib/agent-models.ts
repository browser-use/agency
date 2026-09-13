export type AgentModel = {
  id: string;
  runner: string;
  model: string;
  label: string;
  thinkingLevels: string[];
  defaultThinkingLevel: string;
};

export type AgentSelection = {
  modelId: string;
  thinkingLevel: string;
};

export type AgentSettings = {
  revision: number;
  models: AgentModel[];
  runnerDefault: AgentSelection | null;
  discovery: AgentSelection | null;
  execution: AgentSelection | null;
};

export type AgentConfig = {
  modelId: string;
  runner: string;
  model: string;
  thinkingLevel: string;
  contextMode: "fresh";
  phase: "discovery" | "execution";
  source: "card" | "discovery-default" | "execution-default" | "runner-default";
  settingsRevision: number;
  cardRevision: number;
};

export type AgentRun = {
  runner: string;
  model: string;
  thinkingLevel: string;
  contextMode: "fresh";
  workerId?: string;
};

export class AgentInputError extends Error {}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requiredString(value: unknown, label: string, maxLength = 200) {
  if (typeof value !== "string" || value.trim() !== value || value.length < 1 || value.length > maxLength) {
    throw new AgentInputError(`${label} must be a non-empty string of at most ${maxLength} characters.`);
  }
  return value;
}

export function parseAgentSelection(value: unknown, label = "selection"): AgentSelection {
  if (!isRecord(value)) throw new AgentInputError(`${label} must be an object.`);
  return {
    modelId: requiredString(value.modelId, `${label}.modelId`),
    thinkingLevel: requiredString(value.thinkingLevel, `${label}.thinkingLevel`, 80),
  };
}

export function parseNullableAgentSelection(value: unknown, label = "selection"): AgentSelection | null {
  return value === null ? null : parseAgentSelection(value, label);
}

export function parseAgentModel(value: unknown, index: number): AgentModel {
  const label = `models[${index}]`;
  if (!isRecord(value)) throw new AgentInputError(`${label} must be an object.`);
  if (!Array.isArray(value.thinkingLevels) || value.thinkingLevels.length < 1 || value.thinkingLevels.length > 20) {
    throw new AgentInputError(`${label}.thinkingLevels must contain 1–20 supported levels.`);
  }
  const thinkingLevels = value.thinkingLevels.map((level, levelIndex) =>
    requiredString(level, `${label}.thinkingLevels[${levelIndex}]`, 80));
  if (new Set(thinkingLevels).size !== thinkingLevels.length) {
    throw new AgentInputError(`${label}.thinkingLevels contains duplicates.`);
  }
  const defaultThinkingLevel = requiredString(value.defaultThinkingLevel, `${label}.defaultThinkingLevel`, 80);
  if (!thinkingLevels.includes(defaultThinkingLevel)) {
    throw new AgentInputError(`${label}.defaultThinkingLevel must be supported by the model.`);
  }
  return {
    id: requiredString(value.id, `${label}.id`),
    runner: requiredString(value.runner, `${label}.runner`),
    model: requiredString(value.model, `${label}.model`),
    label: requiredString(value.label, `${label}.label`),
    thinkingLevels,
    defaultThinkingLevel,
  };
}

export function parseAgentCatalog(value: unknown): AgentModel[] {
  if (!Array.isArray(value) || value.length > 100) {
    throw new AgentInputError("models must be an array with at most 100 entries.");
  }
  const models = value.map(parseAgentModel);
  if (new Set(models.map((model) => model.id)).size !== models.length) {
    throw new AgentInputError("Model ids must be unique.");
  }
  if (new Set(models.map((model) => `${model.runner}\u0000${model.model}`)).size !== models.length) {
    throw new AgentInputError("Runner and model identities must be unique.");
  }
  return models;
}

export function validateAgentSelection(
  selection: AgentSelection,
  models: AgentModel[],
  label = "selection",
) {
  const model = models.find((candidate) => candidate.id === selection.modelId);
  if (!model) throw new AgentInputError(`${label} uses an unavailable model.`);
  if (!model.thinkingLevels.includes(selection.thinkingLevel)) {
    throw new AgentInputError(`${label} uses an unsupported thinking level.`);
  }
  return model;
}

export function parseAgentRun(value: unknown): AgentRun {
  if (!isRecord(value)) throw new AgentInputError("agentRun must be an object.");
  if (value.contextMode !== "fresh") throw new AgentInputError("agentRun.contextMode must be fresh.");
  const run: AgentRun = {
    runner: requiredString(value.runner, "agentRun.runner"),
    model: requiredString(value.model, "agentRun.model"),
    thinkingLevel: requiredString(value.thinkingLevel, "agentRun.thinkingLevel", 80),
    contextMode: "fresh",
  };
  if (value.workerId !== undefined) run.workerId = requiredString(value.workerId, "agentRun.workerId", 300);
  return run;
}

export function resolveAgentConfig(
  settings: AgentSettings,
  phase: "discovery" | "execution",
  cardSelection: AgentSelection | null = null,
  cardRevision = 0,
): AgentConfig | null {
  const phaseSelection = phase === "discovery" ? settings.discovery : settings.execution;
  const selection = cardSelection ?? phaseSelection ?? settings.runnerDefault;
  if (settings.models.length === 0 && !selection) return null;
  if (!selection) throw new AgentInputError(`No ${phase} model is configured.`);
  const model = validateAgentSelection(selection, settings.models, cardSelection
    ? "Card selection"
    : phaseSelection
      ? `${phase} default`
      : "Runner default");
  return {
    modelId: model.id,
    runner: model.runner,
    model: model.model,
    thinkingLevel: selection.thinkingLevel,
    contextMode: "fresh",
    phase,
    source: cardSelection ? "card" : phaseSelection ? `${phase}-default` : "runner-default",
    settingsRevision: settings.revision,
    cardRevision,
  };
}

export function tryResolveAgentConfig(
  settings: AgentSettings,
  phase: "discovery" | "execution",
  cardSelection: AgentSelection | null = null,
  cardRevision = 0,
) {
  try {
    return resolveAgentConfig(settings, phase, cardSelection, cardRevision);
  } catch {
    return null;
  }
}

export function agentRunMatchesConfig(run: AgentRun, config: AgentConfig) {
  return run.runner === config.runner
    && run.model === config.model
    && run.thinkingLevel === config.thinkingLevel
    && run.contextMode === config.contextMode;
}

export function expectedRevisionMatches(expected: number | undefined, actual: number) {
  return expected === undefined || expected === actual;
}

export function parseStoredSelection(value: string | null | undefined): AgentSelection | null {
  if (!value) return null;
  try {
    return parseAgentSelection(JSON.parse(value));
  } catch {
    return null;
  }
}

export function parseStoredSelectionOrThrow(value: string | null | undefined, label = "Stored selection") {
  if (!value) return null;
  try {
    return parseAgentSelection(JSON.parse(value), label);
  } catch {
    throw new AgentInputError(`${label} is invalid.`);
  }
}

export function parseStoredAgentConfig(value: string | null | undefined): AgentConfig | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed)
      || parsed.contextMode !== "fresh"
      || !["discovery", "execution"].includes(String(parsed.phase))
      || !["card", "discovery-default", "execution-default", "runner-default"].includes(String(parsed.source))
      || !Number.isInteger(parsed.settingsRevision)
      || Number(parsed.settingsRevision) < 0
      || !Number.isInteger(parsed.cardRevision)
      || Number(parsed.cardRevision) < 0) return null;
    return {
      modelId: requiredString(parsed.modelId, "agentConfig.modelId"),
      runner: requiredString(parsed.runner, "agentConfig.runner"),
      model: requiredString(parsed.model, "agentConfig.model"),
      thinkingLevel: requiredString(parsed.thinkingLevel, "agentConfig.thinkingLevel", 80),
      contextMode: "fresh",
      phase: parsed.phase as AgentConfig["phase"],
      source: parsed.source as AgentConfig["source"],
      settingsRevision: Number(parsed.settingsRevision),
      cardRevision: Number(parsed.cardRevision),
    };
  } catch {
    return null;
  }
}

export function parseStoredAgentRun(value: string | null | undefined): AgentRun | null {
  if (!value) return null;
  try {
    return parseAgentRun(JSON.parse(value));
  } catch {
    return null;
  }
}

export async function readJsonObject(request: Request) {
  try {
    const value: unknown = await request.json();
    if (!isRecord(value)) throw new AgentInputError("Request body must be a JSON object.");
    return value;
  } catch (error) {
    if (error instanceof AgentInputError) throw error;
    throw new AgentInputError("Request body must be valid JSON.");
  }
}

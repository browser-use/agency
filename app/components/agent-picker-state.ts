import type { AgentModel, AgentSelection } from "../../lib/agent-models";

export type SelectionValidity = { valid: boolean; message: string };

export function selectionValidity(models: AgentModel[], selection: AgentSelection | null): SelectionValidity {
  if (!selection) return { valid: true, message: "" };
  const model = models.find((candidate) => candidate.id === selection.modelId);
  if (!model) return { valid: false, message: "This model is unavailable. Choose an available model or use the inherited default." };
  if (!model.thinkingLevels.includes(selection.thinkingLevel)) {
    return { valid: false, message: "This thinking level is unavailable for the selected model." };
  }
  return { valid: true, message: "" };
}

// An empty catalog supports legacy work only when there is no saved choice to
// honor. A card, execution, or runner selection must never become an implicit
// fallback merely because its catalog entry disappeared.
export function selectionCanRun(models: AgentModel[], selection: AgentSelection | null) {
  if (!selection) return models.length === 0;
  return selectionValidity(models, selection).valid;
}

export function selectionCanStartWork(models: AgentModel[], selection: AgentSelection | null, settingsRefreshing: boolean) {
  return !settingsRefreshing && selectionCanRun(models, selection);
}

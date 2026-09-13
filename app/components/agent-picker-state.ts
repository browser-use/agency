import type { AgentModel, AgentSelection } from "../../lib/agent-models";

export type SelectionValidity = { valid: boolean; message: string };

export function thinkingLevelOptions(model: AgentModel | undefined, selection: AgentSelection | null, inheritedSelection: AgentSelection | null) {
  if (!selection) {
    const value = inheritedSelection?.thinkingLevel ?? "";
    return [{ value, label: value ? `From default · ${value}` : "From default" }];
  }
  const options = (model?.thinkingLevels ?? []).map((value) => ({ value, label: value }));
  if (!model?.thinkingLevels.includes(selection.thinkingLevel)) {
    options.unshift({ value: selection.thinkingLevel, label: `${selection.thinkingLevel} (unavailable)` });
  }
  return options;
}

type CardAgentState = {
  id: number;
  version: number;
  agentRevision: number;
  agentSelection: AgentSelection | null;
};

export type CardAgentDraft = {
  selection: AgentSelection | null;
  expectedAgentRevision: number;
  expectedVersion: number;
};

export type CardAgentDrafts = Record<number, CardAgentDraft>;

function sameSelection(left: AgentSelection | null, right: AgentSelection | null) {
  return left?.modelId === right?.modelId && left?.thinkingLevel === right?.thinkingLevel;
}

export function cardAgentDraftState(card: CardAgentState, drafts: CardAgentDrafts) {
  const draft = drafts[card.id];
  const selection = draft ? draft.selection : card.agentSelection;
  const stale = Boolean(draft && (draft.expectedAgentRevision !== card.agentRevision || draft.expectedVersion !== card.version));
  const dirty = Boolean(draft && !sameSelection(selection, card.agentSelection));
  return { draft, selection, stale, dirty, blocksWork: stale || dirty };
}

// A poll can update the card while this choice is still being edited. Keep the
// original comparison revisions until the user explicitly resolves the conflict.
export function updateCardAgentDraft(drafts: CardAgentDrafts, card: CardAgentState, selection: AgentSelection | null): CardAgentDrafts {
  const state = cardAgentDraftState(card, drafts);
  if (!state.stale && sameSelection(selection, card.agentSelection)) return discardCardAgentDraft(drafts, card.id);
  return { ...drafts, [card.id]: {
    selection,
    expectedAgentRevision: state.draft?.expectedAgentRevision ?? card.agentRevision,
    expectedVersion: state.draft?.expectedVersion ?? card.version,
  } };
}

export function discardCardAgentDraft(drafts: CardAgentDrafts, id: number): CardAgentDrafts {
  const next = { ...drafts };
  delete next[id];
  return next;
}

export function reapplyCardAgentDraft(drafts: CardAgentDrafts, card: CardAgentState): CardAgentDrafts {
  const draft = drafts[card.id];
  if (!draft) return drafts;
  return updateCardAgentDraft(discardCardAgentDraft(drafts, card.id), card, draft.selection);
}

// A save may finish after navigation or another local edit. Only that exact
// submitted draft is cleared, and only after the caller refreshes server state.
export function finishCardAgentDraftSave(drafts: CardAgentDrafts, id: number, submitted: CardAgentDraft): CardAgentDrafts {
  return drafts[id] === submitted ? discardCardAgentDraft(drafts, id) : drafts;
}

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

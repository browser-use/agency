"use client";

import type { AgentModel, AgentSelection } from "../../lib/agent-models";
import { selectionValidity } from "./agent-picker-state";

export { selectionValidity } from "./agent-picker-state";

export function selectionLabel(models: AgentModel[], selection: AgentSelection | null, inheritedLabel = "Use runner default") {
  if (!selection) return inheritedLabel;
  const model = models.find((candidate) => candidate.id === selection.modelId);
  return model ? `${model.label} · ${selection.thinkingLevel}` : `${selection.modelId} · ${selection.thinkingLevel}`;
}

export function selectionSummary(models: AgentModel[], selection: AgentSelection | null, inheritedLabel = "Runner default") {
  if (!selection) return inheritedLabel;
  const model = models.find((candidate) => candidate.id === selection.modelId);
  const name = model?.label.replace(/^GPT-[\d.]+\s+|^Claude\s+/i, "") || selection.modelId;
  const thinking = selection.thinkingLevel.charAt(0).toUpperCase() + selection.thinkingLevel.slice(1);
  return `${name} · ${thinking}`;
}

type AgentPickerProps = {
  id: string;
  label: string;
  models: AgentModel[];
  selection: AgentSelection | null;
  inheritedLabel: string;
  inheritedSelection?: AgentSelection | null;
  onChange: (selection: AgentSelection | null) => void;
  disabled?: boolean;
  readOnly?: boolean;
  compact?: boolean;
  description?: string;
};

export function AgentPicker({
  id,
  label,
  models,
  selection,
  inheritedLabel,
  inheritedSelection = null,
  onChange,
  disabled = false,
  readOnly = false,
  compact = false,
  description,
}: AgentPickerProps) {
  const model = selection ? models.find((candidate) => candidate.id === selection.modelId) : undefined;
  const inheritedModel = inheritedSelection ? models.find((candidate) => candidate.id === inheritedSelection.modelId) : undefined;
  const validity = selectionValidity(models, selection);
  const isDisabled = disabled || readOnly;
  const modelId = selection?.modelId ?? "";
  const thinking = selection?.thinkingLevel ?? inheritedSelection?.thinkingLevel ?? "";
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;

  if (readOnly) {
    return (
      <div className="agent-picker agent-picker-readonly">
        <span className="agent-picker-label">{label}</span>
        <strong>{selectionLabel(models, selection ?? inheritedSelection, inheritedLabel)}</strong>
        {description && <small>{description}</small>}
        {!validity.valid && <p className="agent-picker-error" role="alert">{validity.message}</p>}
      </div>
    );
  }

  return (
    <fieldset className={`agent-picker${compact ? " agent-picker-compact" : ""}`} disabled={isDisabled} aria-describedby={`${description ? descriptionId : ""} ${!validity.valid ? errorId : ""}`.trim() || undefined}>
      <legend>{label}</legend>
      {description && <p id={descriptionId} className="agent-picker-description">{description}</p>}
      <div className="agent-picker-fields">
        <label>
          <span>Model</span>
          <select
            value={modelId}
            onChange={(event) => {
              const nextModelId = event.target.value;
              if (!nextModelId) {
                onChange(null);
                return;
              }
              const nextModel = models.find((candidate) => candidate.id === nextModelId);
              if (nextModel) onChange({ modelId: nextModel.id, thinkingLevel: nextModel.defaultThinkingLevel });
            }}
          >
            <option value="">{inheritedLabel}</option>
            {!model && selection && <option value={selection.modelId}>{selection.modelId} (unavailable)</option>}
            {models.map((candidate) => <option key={candidate.id} value={candidate.id}>{candidate.label}</option>)}
          </select>
        </label>
        <label>
          <span>Thinking</span>
          <select
            value={thinking}
            disabled={isDisabled || !model}
            onChange={(event) => selection && onChange({ ...selection, thinkingLevel: event.target.value })}
          >
            {!selection && <option value={thinking}>{thinking ? `From default · ${thinking}` : "From default"}</option>}
            {!model && selection && <option value={selection.thinkingLevel}>{selection.thinkingLevel} (unavailable)</option>}
            {model?.thinkingLevels.map((level) => <option key={level} value={level}>{level}</option>)}
          </select>
        </label>
      </div>
      {!compact && !selection && <p className="agent-picker-inherited">Current: {selectionLabel(models, inheritedSelection, inheritedModel ? inheritedModel.label : "No default configured")}</p>}
      {!validity.valid && <p id={errorId} className="agent-picker-error" role="alert">{validity.message}</p>}
    </fieldset>
  );
}

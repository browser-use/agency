"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { AgentPicker, selectionLabel, selectionSummary } from "../components/agent-picker";
import { selectionValidity } from "../components/agent-picker-state";
import type { AgentSelection, AgentSettings } from "../../lib/agent-models";
import type { Topic } from "../../lib/card-cluster";

type Draft = { id?: string; label: string; hint: string };
type AgentDefaultsDraft = Pick<AgentSettings, "discovery" | "execution">;

function sameSelection(left: AgentSelection | null, right: AgentSelection | null) {
  return left?.modelId === right?.modelId && left?.thinkingLevel === right?.thinkingLevel;
}

export default function SettingsPage() {
  const [dream, setDream] = useState("");
  const [savedDream, setSavedDream] = useState("");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);
  const [agentSettings, setAgentSettings] = useState<AgentSettings | null>(null);
  const [agentDraft, setAgentDraft] = useState<AgentDefaultsDraft | null>(null);
  const [agentSaving, setAgentSaving] = useState(false);
  const [agentReloading, setAgentReloading] = useState(true);
  const [agentError, setAgentError] = useState("");
  const agentRequestRef = useRef(0);

  function load() {
    return Promise.all([
      fetch("/api/state?view=working&light=1", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/topics", { cache: "no-store" }).then((r) => r.json()),
    ]).then(([state, list]) => {
      const text = state.context?.text ?? "";
      setDream(text); setSavedDream(text); setTopics(list.topics ?? []);
    });
  }

  const loadAgentSettings = useCallback(async () => {
    const requestId = ++agentRequestRef.current;
    setAgentReloading(true);
    try {
      const response = await fetch("/api/agent-settings", { cache: "no-store" });
      const result = await response.json().catch(() => null) as AgentSettings | { error?: string } | null;
      if (requestId !== agentRequestRef.current) return;
      if (!response.ok || !result || !("models" in result)) throw new Error((result as { error?: string } | null)?.error || "Agent defaults could not be loaded.");
      setAgentSettings(result);
      setAgentDraft({ discovery: result.discovery, execution: result.execution });
      setAgentError("");
    } catch (error) {
      if (requestId === agentRequestRef.current) setAgentError(error instanceof Error ? error.message : "Agent defaults could not be loaded.");
    } finally {
      if (requestId === agentRequestRef.current) setAgentReloading(false);
    }
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); void loadAgentSettings(); }, 0);
    return () => window.clearTimeout(timer);
  }, [loadAgentSettings]);

  async function saveDream() {
    const text = dream.trim();
    if (!text || text === savedDream.trim()) return;
    setBusy(true);
    await fetch("/api/context", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    setSavedDream(text); setBusy(false);
  }
  async function saveTopic() {
    if (!editing || !editing.label.trim()) return;
    setBusy(true);
    await fetch("/api/topics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(editing) });
    setEditing(null); await load(); setBusy(false);
  }
  async function removeTopic(id: string) {
    if (!window.confirm("Remove this topic? Its cards stay and show under All until they are refiled.")) return;
    setBusy(true);
    await fetch(`/api/topics?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    await load(); setBusy(false);
  }

  async function saveAgentDefaults() {
    if (!agentSettings || !agentDraft || agentSaving || agentReloading) return;
    const discoveryValidity = selectionValidity(agentSettings.models, agentDraft.discovery);
    const executionValidity = selectionValidity(agentSettings.models, agentDraft.execution);
    if (!discoveryValidity.valid || !executionValidity.valid) return;
    const requestId = ++agentRequestRef.current;
    setAgentSaving(true);
    setAgentError("");
    try {
      const response = await fetch("/api/agent-settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision: agentSettings.revision, discovery: agentDraft.discovery, execution: agentDraft.execution }),
      });
      const result = await response.json().catch(() => null) as AgentSettings | { error?: string; settings?: AgentSettings } | null;
      if (!response.ok || !result || !("models" in result)) {
        const latest = (result as { settings?: AgentSettings } | null)?.settings;
        if (latest?.models && requestId === agentRequestRef.current) setAgentSettings(latest);
        throw new Error((result as { error?: string } | null)?.error || "Agent defaults were not saved.");
      }
      if (requestId !== agentRequestRef.current) return;
      setAgentSettings(result);
      setAgentDraft({ discovery: result.discovery, execution: result.execution });
    } catch (error) {
      if (requestId === agentRequestRef.current) setAgentError(error instanceof Error ? error.message : "Agent defaults were not saved.");
    } finally {
      if (requestId === agentRequestRef.current) setAgentSaving(false);
    }
  }

  const dreamChanged = dream.trim() !== savedDream.trim();
  const agentDirty = Boolean(agentSettings && agentDraft && (!sameSelection(agentSettings.discovery, agentDraft.discovery) || !sameSelection(agentSettings.execution, agentDraft.execution)));
  const discoveryDirty = Boolean(agentSettings && agentDraft && !sameSelection(agentSettings.discovery, agentDraft.discovery));
  const executionDirty = Boolean(agentSettings && agentDraft && !sameSelection(agentSettings.execution, agentDraft.execution));
  const discoveryValidity = selectionValidity(agentSettings?.models ?? [], agentDraft?.discovery ?? null);
  const executionValidity = selectionValidity(agentSettings?.models ?? [], agentDraft?.execution ?? null);
  const agentInvalid = !discoveryValidity.valid || !executionValidity.valid;

  return (
    <main className="stats-shell settings-shell">
      <header className="stats-header">
        <Link href="/" className="stats-back">← Back</Link>
        <h1 className="settings-title">Settings</h1>
        <span />
      </header>

      <section className="settings-block">
        <div className="settings-head">
          <h2>My dream</h2>
          <p>Your goals and priorities. Your coding agent reads this before finding ideas and keeps its private profile up to date. Edit it whenever your priorities change.</p>
        </div>
        <textarea className="settings-dream" value={dream} onChange={(event) => setDream(event.target.value)} placeholder="What you are aiming at, what to keep monitoring, what to leave alone." />
        <div className="settings-actions">
          <button className="is-dark" disabled={!dreamChanged || busy} onClick={() => void saveDream()}>{dreamChanged ? "Save dream" : "Saved"}</button>
        </div>
      </section>

      <section className="settings-block">
        <div className="settings-head">
          <h2>Topics</h2>
          <p>Name a topic and describe it. Your agent uses these topics when making cards.</p>
        </div>
        <ul className="settings-topics">
          {topics.map((t) => (
            <li key={t.id}>
              <div>
                <strong>{t.label}</strong>
                <span>{t.hint || "no description"}</span>
              </div>
              <div className="settings-row-actions">
                <button onClick={() => setEditing({ id: t.id, label: t.label, hint: t.hint })}>Edit</button>
                <button className="is-danger" onClick={() => void removeTopic(t.id)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
        {editing ? (
          <div className="settings-editor">
            <label><span>Name</span><input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="e.g. Hiring" /></label>
            <label><span>Description</span><input value={editing.hint} onChange={(e) => setEditing({ ...editing, hint: e.target.value })} placeholder="What belongs here" maxLength={120} /></label>
            <div className="settings-actions">
              <button onClick={() => setEditing(null)}>Cancel</button>
              <button className="is-dark" disabled={!editing.label.trim() || busy} onClick={() => void saveTopic()}>{editing.id ? "Save topic" : "Add topic"}</button>
            </div>
          </div>
        ) : (
          <div className="settings-actions"><button className="is-dark" onClick={() => setEditing({ label: "", hint: "" })}>Add topic</button></div>
        )}
      </section>
      <section className="settings-block settings-models-block">
        <details className="settings-models">
          <summary>
            <span className="settings-models-summary">
              <strong>Models</strong>
              <span>{agentSettings
                ? `Discovery: ${selectionSummary(agentSettings.models, agentSettings.discovery ?? agentSettings.runnerDefault)} · Execution: ${selectionSummary(agentSettings.models, agentSettings.execution ?? agentSettings.runnerDefault)}`
                : "Choose defaults for finding ideas and doing work"}</span>
            </span>
            {agentReloading ? <span className="settings-models-state" role="status">{agentSettings ? "Reloading…" : "Loading…"}</span> : agentSaving ? <span className="settings-models-state" role="status">Saving…</span> : agentDirty ? <span className="settings-models-state is-dirty" role="status">Unsaved changes</span> : null}
            <svg viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="m3 4.5 3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
          </summary>
          <div className="settings-models-editors">
            <p className="settings-agent-help">Separate defaults for finding ideas and doing approved work. Save to apply your choices.</p>
            {!agentSettings && !agentError && <p className="settings-agent-status" role="status">Loading available models…</p>}
            {agentSettings && agentDraft && <>
              <div className="settings-agent-defaults">
                <AgentPicker id="discovery-default" label="Discovery" models={agentSettings.models} selection={agentDraft.discovery} inheritedLabel="Use runner default" inheritedSelection={agentSettings.runnerDefault} onChange={(discovery) => setAgentDraft((current) => current ? { ...current, discovery } : current)} disabled={agentSaving || agentReloading} description={discoveryDirty ? `Saved choice: ${selectionLabel(agentSettings.models, agentSettings.discovery, "Use runner default")}.` : "Find and prepare new ideas."} />
                <AgentPicker id="execution-default" label="Execution" models={agentSettings.models} selection={agentDraft.execution} inheritedLabel="Use runner default" inheritedSelection={agentSettings.runnerDefault} onChange={(execution) => setAgentDraft((current) => current ? { ...current, execution } : current)} disabled={agentSaving || agentReloading} description={executionDirty ? `Saved choice: ${selectionLabel(agentSettings.models, agentSettings.execution, "Use runner default")}.` : "Carry out approved work and card changes."} />
              </div>
              <div className="settings-actions settings-agent-actions">
                <span className={agentDirty ? "is-dirty" : ""} role="status">{agentReloading ? "Reloading defaults…" : agentSaving ? "Saving defaults…" : agentInvalid ? "Choose an available model and thinking level." : agentDirty ? "Unsaved changes" : "Saved"}</span>
                <button disabled={agentSaving || agentReloading} onClick={() => void loadAgentSettings()}>{agentReloading ? "Reloading…" : agentDirty ? "Discard and reload" : "Reload saved"}</button>
                <button className="is-dark" disabled={!agentDirty || agentSaving || agentReloading || agentInvalid} onClick={() => void saveAgentDefaults()}>{agentSaving ? "Saving…" : "Save defaults"}</button>
              </div>
            </>}
          </div>
        </details>
        {agentInvalid && <p className="model-controls-notice" role="status">Choose an available model and thinking level before saving.</p>}
        {agentError && <p className="settings-agent-error" role="alert">{agentError}</p>}
        {!agentSettings && agentError && <div className="settings-actions"><button disabled={agentSaving || agentReloading} onClick={() => void loadAgentSettings()}>{agentReloading ? "Reloading…" : "Retry models"}</button></div>}
      </section>
    </main>
  );
}

"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Topic } from "../../lib/card-cluster";
import { DEFAULT_PROJECT_ID, MAX_PROJECT_LABEL_LENGTH, projectHref, projectSlug, readActiveProject, rememberActiveProject, type Project } from "../../lib/project";

type Draft = { id?: string; label: string; hint: string };
type ProjectDraft = { id?: string; label: string };

/** Returns the server's error message, or null when the write succeeded. */
async function send(url: string, init: RequestInit) {
  const response = await fetch(url, { ...init, headers: { "content-type": "application/json" } });
  if (response.ok) return { error: null, result: await response.json().catch(() => null) as { id?: string } | null };
  const result = await response.json().catch(() => null) as { error?: string } | null;
  return { error: result?.error || "That did not save. Try again.", result: null };
}

export default function SettingsPage() {
  const [projectId, setProjectId] = useState(readActiveProject);
  const [projects, setProjects] = useState<Project[]>([]);
  const [dream, setDream] = useState("");
  const [savedDream, setSavedDream] = useState("");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [editingProject, setEditingProject] = useState<ProjectDraft | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    rememberActiveProject(projectId);
    const url = new URL(window.location.href);
    if (projectId === DEFAULT_PROJECT_ID) url.searchParams.delete("project");
    else url.searchParams.set("project", projectId);
    window.history.replaceState(null, "", url);
  }, [projectId]);

  useEffect(() => {
    let cancelled = false;
    const query = `project=${encodeURIComponent(projectId)}`;
    void Promise.all([
      fetch(`/api/state?view=working&light=1&${query}`, { cache: "no-store" }),
      fetch(`/api/topics?${query}`, { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/projects", { cache: "no-store" }).then((r) => r.json()),
    ]).then(async ([stateResponse, list, projectList]) => {
      if (cancelled) return;
      setProjects(projectList.projects ?? []);
      if (stateResponse.status === 404 && projectId !== DEFAULT_PROJECT_ID) return setProjectId(DEFAULT_PROJECT_ID);
      const state = await stateResponse.json();
      if (cancelled) return;
      const text = state.context?.text ?? "";
      setDream(text); setSavedDream(text); setTopics(list.topics ?? []);
    });
    return () => { cancelled = true; };
  }, [projectId, reload]);

  function refresh() {
    setReload((count) => count + 1);
  }
  function selectProject(next: string) {
    setEditing(null); setEditingProject(null); setError("");
    setProjectId(next);
  }

  async function saveDream() {
    const text = dream.trim();
    if (!text || text === savedDream.trim()) return;
    setBusy(true);
    const { error: failure } = await send("/api/context", { method: "POST", body: JSON.stringify({ text, projectId }) });
    setError(failure ?? "");
    if (!failure) setSavedDream(text);
    setBusy(false);
  }
  async function saveTopic() {
    if (!editing || !editing.label.trim()) return;
    setBusy(true);
    const { error: failure } = await send("/api/topics", { method: "POST", body: JSON.stringify({ ...editing, projectId }) });
    setError(failure ?? "");
    if (!failure) { setEditing(null); refresh(); }
    setBusy(false);
  }
  async function removeTopic(id: string) {
    if (!window.confirm("Remove this topic? Its cards stay and show under All until they are refiled.")) return;
    setBusy(true);
    const { error: failure } = await send(`/api/topics?project=${encodeURIComponent(projectId)}&id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setError(failure ?? "");
    refresh(); setBusy(false);
  }
  async function saveProject() {
    if (!editingProject || !editingProject.label.trim()) return;
    setBusy(true);
    const creating = !editingProject.id;
    const { error: failure, result } = await send("/api/projects", { method: "POST", body: JSON.stringify(editingProject) });
    setError(failure ?? "");
    setBusy(false);
    if (failure) return;
    setEditingProject(null);
    if (creating && result?.id) selectProject(result.id);
    else refresh();
  }
  async function removeProject(id: string) {
    if (!window.confirm("Remove this empty project, its dream and its topics?")) return;
    setBusy(true);
    const { error: failure } = await send(`/api/projects?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    setError(failure ?? "");
    setBusy(false);
    if (!failure && id === projectId) selectProject(DEFAULT_PROJECT_ID);
    else refresh();
  }

  // Server and first client render have no projects yet, so anything project-specific renders from `project`.
  const project = projects.find((item) => item.id === projectId);
  const homeHref = projectHref("/", project?.id ?? DEFAULT_PROJECT_ID);
  const dreamChanged = dream.trim() !== savedDream.trim();
  return (
    <main className="stats-shell settings-shell">
      <header className="stats-header">
        <Link href={homeHref} className="stats-back">← Back</Link>
        <h1 className="settings-title">Settings</h1>
        {projects.length ? (
          <select className="radar-project" aria-label="Project" value={projectId} onChange={(event) => selectProject(event.target.value)}>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}
          </select>
        ) : <span />}
      </header>

      {error && <p className="settings-error" role="alert">{error}</p>}

      <section className="settings-block">
        <div className="settings-head">
          <h2>{project ? `Dream for ${project.label}` : "My dream"}</h2>
          <p>This project&rsquo;s goals and priorities. Your coding agent reads this before finding ideas and keeps <code>projects/{project?.id ?? "<id>"}/me.md</code> in step with it. Edit it whenever your priorities change.</p>
        </div>
        <textarea className="settings-dream" value={dream} onChange={(event) => setDream(event.target.value)} placeholder="What you are aiming at, what to keep monitoring, what to leave alone." />
        <div className="settings-actions">
          <button className="is-dark" disabled={!dreamChanged || busy} onClick={() => void saveDream()}>{dreamChanged ? "Save dream" : "Saved"}</button>
        </div>
      </section>

      <section className="settings-block">
        <div className="settings-head">
          <h2>Topics</h2>
          <p>Name a topic and describe it. Each project has its own topics. Your agent uses them when making cards.</p>
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

      <section className="settings-block" id="projects">
        <div className="settings-head">
          <h2>Projects</h2>
          <p>Each project keeps its own dream, topics, cards and stats. Your voice and preferences in <code>me.md</code> apply to all of them.</p>
        </div>
        <ul className="settings-topics">
          {projects.map((item) => (
            <li key={item.id}>
              <div>
                <strong>{item.label}</strong>
                <span>{item.id} · {item.cards} {item.cards === 1 ? "card" : "cards"}{item.open ? ` · ${item.open} new` : ""}</span>
              </div>
              <div className="settings-row-actions">
                {item.id !== projectId && <button onClick={() => selectProject(item.id)}>Open</button>}
                <button onClick={() => setEditingProject({ id: item.id, label: item.label })}>Rename</button>
                {item.id !== DEFAULT_PROJECT_ID && item.cards === 0 && <button className="is-danger" onClick={() => void removeProject(item.id)}>Remove</button>}
              </div>
            </li>
          ))}
        </ul>
        {editingProject ? (
          <div className="settings-editor">
            <label>
              <span>Name</span>
              <input value={editingProject.label} maxLength={MAX_PROJECT_LABEL_LENGTH} onChange={(e) => setEditingProject({ ...editingProject, label: e.target.value })} placeholder="e.g. Acme" />
            </label>
            <small>Id: {editingProject.id ?? (projectSlug(editingProject.label) || "–")}{editingProject.id ? " (ids stay fixed)" : ""}</small>
            <div className="settings-actions">
              <button onClick={() => setEditingProject(null)}>Cancel</button>
              <button className="is-dark" disabled={!editingProject.label.trim() || busy} onClick={() => void saveProject()}>{editingProject.id ? "Rename project" : "Add project"}</button>
            </div>
          </div>
        ) : (
          <div className="settings-actions"><button className="is-dark" onClick={() => setEditingProject({ label: "" })}>Add project</button></div>
        )}
      </section>
    </main>
  );
}

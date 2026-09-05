"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Topic } from "../../lib/card-cluster";

type Draft = { id?: string; label: string; hint: string; keywords: string };

export default function SettingsPage() {
  const [dream, setDream] = useState("");
  const [savedDream, setSavedDream] = useState("");
  const [topics, setTopics] = useState<Topic[]>([]);
  const [editing, setEditing] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  function load() {
    return Promise.all([
      fetch("/api/state?view=working&light=1", { cache: "no-store" }).then((r) => r.json()),
      fetch("/api/topics", { cache: "no-store" }).then((r) => r.json()),
    ]).then(([state, list]) => {
      const text = state.context?.text ?? "";
      setDream(text); setSavedDream(text); setTopics(list.topics ?? []);
    });
  }
  useEffect(() => { void load(); }, []);

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

  const dreamChanged = dream.trim() !== savedDream.trim();
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
          <p>My profile and my dream in one document: <code>me.md</code> in this checkout, or the file set by <code>ME_PATH</code>. Agency reads it before every wave. Keep it in sync with <code>scripts/sync-me.mjs</code>.</p>
        </div>
        <textarea className="settings-dream" value={dream} onChange={(event) => setDream(event.target.value)} placeholder="What you are aiming at, what to keep monitoring, what to leave alone." />
        <div className="settings-actions">
          <button className="is-dark" disabled={!dreamChanged || busy} onClick={() => void saveDream()}>{dreamChanged ? "Save dream" : "Saved"}</button>
        </div>
      </section>

      <section className="settings-block">
        <div className="settings-head">
          <h2>Topics</h2>
          <p>The filters on the left. A card lands in the first topic whose keywords match its category or headline; unmatched cards show only under All. Agents can add topics too.</p>
        </div>
        <ul className="settings-topics">
          {topics.map((t) => (
            <li key={t.id}>
              <div>
                <strong>{t.label}</strong>
                <span>{t.hint || "no description"}</span>
                <small>{t.keywords.slice(0, 8).join(" · ")}{t.keywords.length > 8 ? ` · +${t.keywords.length - 8}` : ""}</small>
              </div>
              <div className="settings-row-actions">
                <button onClick={() => setEditing({ id: t.id, label: t.label, hint: t.hint, keywords: t.keywords.join(", ") })}>Edit</button>
                <button className="is-danger" onClick={() => void removeTopic(t.id)}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
        {editing ? (
          <div className="settings-editor">
            <label><span>Name</span><input value={editing.label} onChange={(e) => setEditing({ ...editing, label: e.target.value })} placeholder="e.g. Hiring" /></label>
            <label><span>One line</span><input value={editing.hint} onChange={(e) => setEditing({ ...editing, hint: e.target.value })} placeholder="what belongs here" /></label>
            <label><span>Keywords</span><input value={editing.keywords} onChange={(e) => setEditing({ ...editing, keywords: e.target.value })} placeholder="comma separated, matched against category and headline" /></label>
            <div className="settings-actions">
              <button onClick={() => setEditing(null)}>Cancel</button>
              <button className="is-dark" disabled={!editing.label.trim() || busy} onClick={() => void saveTopic()}>{editing.id ? "Save topic" : "Add topic"}</button>
            </div>
          </div>
        ) : (
          <div className="settings-actions"><button className="is-dark" onClick={() => setEditing({ label: "", hint: "", keywords: "" })}>Add topic</button></div>
        )}
      </section>
    </main>
  );
}

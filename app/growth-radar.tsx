"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cardDraftKey, cardHasChanged, keepSelectedCard, nextCardAfterRemoval } from "../lib/card-focus";
import { cardShortcut } from "../lib/card-shortcut";
import { compareByRise } from "../lib/rise";

type Idea = {
  id: number;
  version: number;
  project: string;
  category: string;
  headline: string;
  cardHtml: string;
  agentContext: string;
  score: number;
  riseReach: number;
  riseImpact: number;
  riseStrategicFit: number;
  riseEase: number;
  sourceLabel: string;
  sourceUrl: string;
  agentName: string;
  status: "new" | "working" | "done";
  jobId: number | null;
  jobStatus: "queued" | "running" | "done" | "failed" | null;
  jobOutcome: "completed" | "review" | "blocked" | null;
  jobResult: string | null;
  jobLabel: string | null;
  jobUpdatedAt: string | null;
  decisionActiveMs: number | null;
  decisionWallMs: number | null;
  decisionAction: "do" | "change" | "no" | null;
  decisionEstimateMs: number;
  decisionEstimateReason: string;
  decisionKind: "pr" | "message" | "visual" | "task";
};

type RadarState = {
  context: { text: string; createdAt: string } | null;
  ideas: Idea[];
  jobs: { queued: number; running: number };
  completionStats: { verified: number; legacy: number; reviewReady: number; dismissed: number };
  decisionMetrics: {
    tracked: number;
    accepted: number;
    changed: number;
    rejected: number;
    parked: number;
    medianActiveMs: number | null;
    medianAcceptedActiveMs: number | null;
    medianFastWallMs: number | null;
    medianFirstActionMs: number | null;
    medianEstimateErrorMs: number | null;
  };
};

type CardAction = {
  action: "do" | "open";
  label?: string;
  prompt?: string;
  url?: string;
};

type AttentionTracker = {
  id: number;
  version: number;
  lastInteractionAt: number;
  lastTickAt: number;
  pendingActiveMs: number;
  totalActiveMs: number;
};

const emptyState: RadarState = {
  context: null,
  ideas: [],
  jobs: { queued: 0, running: 0 },
  completionStats: { verified: 0, legacy: 0, reviewReady: 0, dismissed: 0 },
  decisionMetrics: {
    tracked: 0,
    accepted: 0,
    changed: 0,
    rejected: 0,
    parked: 0,
    medianActiveMs: null,
    medianAcceptedActiveMs: null,
    medianFastWallMs: null,
    medianFirstActionMs: null,
    medianEstimateErrorMs: null,
  },
};

function formatDuration(milliseconds: number | null) {
  if (milliseconds === null || !Number.isFinite(milliseconds)) return "—";
  const seconds = Math.max(0, Math.round(milliseconds / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.round(minutes / 60)}h`;
}

function decisionLabel(action: Idea["decisionAction"]) {
  if (action === "do") return "Accepted";
  if (action === "no") return "Skipped";
  return "Changed";
}

function decisionKindLabel(kind: Idea["decisionKind"]) {
  if (kind === "pr") return "PR review";
  if (kind === "message") return "message";
  if (kind === "visual") return "visual check";
  return "card";
}

function ideasForView(ideas: Idea[], view: Idea["status"]) {
  return ideas.filter((idea) => idea.status === view).toSorted(compareByRise);
}

function summarizeJobResult(result: string) {
  const firstLine = result
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*(?:[-*#>]+|\d+[.)])\s*/, "").trim())
    .find(Boolean) ?? "";
  if (firstLine.length <= 180) return firstLine;
  const clipped = firstLine.slice(0, 177);
  const lastSpace = clipped.lastIndexOf(" ");
  return `${clipped.slice(0, lastSpace > 120 ? lastSpace : 177)}…`;
}

function improveLabel(idea: Idea) {
  const subject = `${idea.category} ${idea.headline} ${idea.sourceLabel}`.toLowerCase();
  if (/\b(post|tweet|linkedin|social|thread)\b/.test(subject)) return "Improve post";
  if (/\b(video|demo|reel|recording)\b/.test(subject)) return "Improve demo";
  if (/\b(design|visual|image|graphic|showcase|landing|page)\b/.test(subject)) return "Improve design";
  return "Improve card";
}

function AgentCard({ idea, actionable, onAction, onInteraction }: { idea: Idea; actionable: boolean; onAction: (action: CardAction) => void; onInteraction: (action: string, label: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const onActionRef = useRef(onAction);
  const onInteractionRef = useRef(onInteraction);

  useEffect(() => {
    onActionRef.current = onAction;
    onInteractionRef.current = onInteraction;
  }, [onAction, onInteraction]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block}*{box-sizing:border-box}[data-radar-action="open"]{display:inline-flex!important;align-items:center;gap:.38em}[data-radar-action="open"]::after{content:"↗";font-size:.8em;line-height:1;opacity:.68;transform:translateY(-.08em)}.radar-fallback-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.radar-fallback-actions button{min-height:46px;padding:0 16px;border:2px solid #111;border-radius:999px;background:#fff;color:#111;font:800 14px/1 system-ui;cursor:pointer}.radar-fallback-actions button:first-child{background:#111;color:#fff}</style>${idea.cardHtml}`;
    root.querySelectorAll('[data-radar-action="change"], [data-radar-action="no"]').forEach((button) => button.remove());
    root.querySelectorAll<HTMLElement>('[data-radar-action="open"]').forEach((button) => {
      if (!button.title) button.title = "Opens a link";
    });
    const missingDo = !root.querySelector('[data-radar-action="do"]');
    if (missingDo) {
      const fallback = document.createElement("div");
      fallback.className = "radar-fallback-actions";
      const next = document.createElement("button");
      next.textContent = "Find next step";
      next.dataset.radarAction = "do";
      next.dataset.radarPrompt = "Continue from this older card. Re-read the current Agency skill and use the stored full card context. Choose the most useful concrete next step, complete every safe reversible part, and return a specific replacement card with proof and a meaningful next action. Stop at the exact outside-action boundary.";
      fallback.append(next);
      root.append(fallback);
    }
    if (!actionable) {
      root.querySelectorAll<HTMLElement>("[data-radar-action]").forEach((button) => {
        if (button.dataset.radarAction === "open") return;
        button.setAttribute("aria-disabled", "true");
        button.style.pointerEvents = "none";
        button.style.opacity = "0.5";
      });
    }
    const click = (event: Event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-radar-action]") : null;
      if (!target) {
        const summary = event.target instanceof Element ? event.target.closest<HTMLElement>("summary") : null;
        if (summary) onInteractionRef.current("details", (summary.textContent || "Details").trim().slice(0, 120));
        return;
      }
      const action = target.dataset.radarAction;
      if (!action || !["do", "open"].includes(action)) return;
      if (!actionable && action !== "open") return;
      event.preventDefault();
      onActionRef.current({
        action: action as CardAction["action"],
        label: (target.getAttribute("aria-label") || target.textContent || "").trim(),
        prompt: target.dataset.radarPrompt || "",
        url: target.dataset.radarUrl || "",
      });
    };
    root.addEventListener("click", click);
    return () => root.removeEventListener("click", click);
  }, [actionable, idea.id, idea.cardHtml]);

  return <div ref={hostRef} />;
}

export function GrowthRadar() {
  const [data, setData] = useState<RadarState>(emptyState);
  const [view, setView] = useState<"new" | "working" | "done">("new");
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  const [composer, setComposer] = useState<"task" | "context" | null>(null);
  const [contextDraft, setContextDraft] = useState("");
  const [taskDraft, setTaskDraft] = useState("");
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [liveDecision, setLiveDecision] = useState({ key: "", activeMs: 0 });
  const liveDecisionByCardRef = useRef<Record<string, number>>({});
  const attentionTrackerRef = useRef<AttentionTracker | null>(null);
  // `?card=<id>` opens one exact card on first load, whatever lane it sits in.
  const deepLinkHandledRef = useRef(false);

  const load = useCallback(async (
    targetView: Idea["status"] = view,
    selection?: { preferred: Idea | null; excludeId?: number },
  ) => {
    const response = await fetch("/api/state", { cache: "no-store" });
    const next = (await response.json()) as RadarState;
    if (!deepLinkHandledRef.current) {
      deepLinkHandledRef.current = true;
      const requestedId = Number(new URLSearchParams(window.location.search).get("card"));
      const requested = next.ideas.find((idea) => idea.id === requestedId);
      if (requested) {
        setData(next);
        setView(requested.status);
        setSelectedIdea(requested);
        setLoading(false);
        return;
      }
    }
    const visible = ideasForView(next.ideas, targetView).filter((idea) => idea.id !== selection?.excludeId);
    setData(next);
    setSelectedIdea((current) => keepSelectedCard(selection ? selection.preferred : current, visible));
    setLoading(false);
  }, [view]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    if (selectedIdea) url.searchParams.set("card", String(selectedIdea.id));
    else url.searchParams.delete("card");
    window.history.replaceState(null, "", url);
  }, [selectedIdea]);

  useEffect(() => {
    const refresh = () => void load();
    const first = window.setTimeout(refresh, 0);
    const timer = window.setInterval(refresh, 5000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
    };
  }, [load]);

  const visibleIdeas = useMemo(() => ideasForView(data.ideas, view), [data.ideas, view]);
  const laneCounts = useMemo(() => data.ideas.reduce((counts, idea) => {
    counts[idea.status] += 1;
    return counts;
  }, { new: 0, working: 0, done: 0 }), [data.ideas]);
  const active = selectedIdea;
  const selectedIndex = active === null ? -1 : visibleIdeas.findIndex((idea) => idea.id === active.id);
  const activeIndex = selectedIndex >= 0 ? selectedIndex : 0;
  const latestSelected = active ? data.ideas.find((idea) => idea.id === active.id) : undefined;
  const hasIncomingUpdate = active ? cardHasChanged(active, latestSelected) : false;
  const feedbackKey = active ? cardDraftKey(active) : "";
  const feedback = feedbackKey ? feedbackDrafts[feedbackKey] ?? "" : "";
  const activeLiveState = latestSelected ?? active;
  const activeJob = activeLiveState?.jobId ? {
    id: activeLiveState.jobId,
    status: activeLiveState.jobStatus,
    outcome: activeLiveState.jobOutcome,
    result: activeLiveState.jobResult?.trim() ?? "",
    label: activeLiveState.jobLabel?.trim() ?? "",
  } : null;
  const jobInFlight = activeJob?.status === "queued" || activeJob?.status === "running";
  const activeJobSummary = activeJob ? summarizeJobResult(activeJob.result) : "";
  const activeJobHasMore = Boolean(activeJob?.result && activeJob.result !== activeJobSummary);
  const attentionIdeaId = active?.id ?? null;
  const attentionIdeaVersion = active?.version ?? null;
  const attentionDecisionAction = active?.decisionAction ?? null;
  const attentionInitialActiveMs = Number(active?.decisionActiveMs ?? 0);
  const liveDecisionMs = active && liveDecision.key === cardDraftKey(active)
    ? liveDecision.activeMs
    : attentionInitialActiveMs;

  const takePendingActiveMs = useCallback((id: number, version: number, flush = true) => {
    const tracker = attentionTrackerRef.current;
    if (!tracker || tracker.id !== id || tracker.version !== version) return 0;
    const now = Date.now();
    const elapsed = Math.min(15_000, Math.max(0, now - tracker.lastTickAt));
    tracker.lastTickAt = now;
    if (document.visibilityState === "visible" && document.hasFocus() && now - tracker.lastInteractionAt <= 60_000) {
      tracker.pendingActiveMs += elapsed;
      tracker.totalActiveMs += elapsed;
      liveDecisionByCardRef.current[`${id}:${version}`] = tracker.totalActiveMs;
      setLiveDecision({ key: `${id}:${version}`, activeMs: tracker.totalActiveMs });
    }
    if (!flush) return 0;
    const pending = Math.min(15_000, Math.round(tracker.pendingActiveMs));
    tracker.pendingActiveMs = 0;
    return pending;
  }, []);

  useEffect(() => {
    if (attentionIdeaId === null || attentionIdeaVersion === null || attentionDecisionAction || composer) return;
    const id = attentionIdeaId;
    const version = attentionIdeaVersion;
    const now = Date.now();
    const totalActiveMs = Math.max(attentionInitialActiveMs, liveDecisionByCardRef.current[`${id}:${version}`] ?? 0);
    const tracker: AttentionTracker = { id, version, lastInteractionAt: now, lastTickAt: now, pendingActiveMs: 0, totalActiveMs };
    attentionTrackerRef.current = tracker;

    const sendAttention = (event: "view" | "active", activeMs = 0) => {
      void fetch("/api/ideas/attention", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, version, event, activeMs }),
        keepalive: true,
      }).catch(() => undefined);
    };
    const markInteraction = () => {
      if (attentionTrackerRef.current !== tracker) return;
      const interactionAt = Date.now();
      if (interactionAt - tracker.lastInteractionAt > 60_000) tracker.lastTickAt = interactionAt;
      tracker.lastInteractionAt = interactionAt;
    };
    const tick = () => {
      const activeMs = takePendingActiveMs(id, version);
      if (activeMs) sendAttention("active", activeMs);
    };

    sendAttention("view");
    const events: Array<keyof WindowEventMap> = ["pointerdown", "pointermove", "keydown", "scroll", "touchstart"];
    events.forEach((event) => window.addEventListener(event, markInteraction, { passive: true }));
    const displayTimer = window.setInterval(() => takePendingActiveMs(id, version, false), 1_000);
    const flushTimer = window.setInterval(tick, 5_000);
    return () => {
      window.clearInterval(displayTimer);
      window.clearInterval(flushTimer);
      events.forEach((event) => window.removeEventListener(event, markInteraction));
      const activeMs = takePendingActiveMs(id, version);
      if (activeMs) sendAttention("active", activeMs);
      if (attentionTrackerRef.current === tracker) attentionTrackerRef.current = null;
    };
  }, [attentionDecisionAction, attentionIdeaId, attentionIdeaVersion, attentionInitialActiveMs, composer, takePendingActiveMs]);

  const recordCardInteraction = useCallback((target: Idea | null, action: string, label: string) => {
    if (!target) return;
    const activeMs = takePendingActiveMs(target.id, target.version);
    void fetch("/api/ideas/attention", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: target.id, version: target.version, event: "interaction", action, label, activeMs }),
      keepalive: true,
    }).catch(() => undefined);
  }, [takePendingActiveMs]);

  const sendToAgent = useCallback(async (target: Idea, action: "do" | "change" | "no", label: string, prompt = "", note = "") => {
    const activeMs = takePendingActiveMs(target.id, target.version);
    const response = await fetch("/api/ideas/action", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ id: target.id, version: target.version, status: target.status, action, label, prompt, note, activeMs }),
    });
    if (response.status === 409) {
      const tracker = attentionTrackerRef.current;
      if (tracker?.id === target.id && tracker.version === target.version) tracker.pendingActiveMs += activeMs;
      setMessage("This card changed while you were reading. Your draft is still saved here. Show the update before sending.");
      return false;
    }
    if (!response.ok) {
      const tracker = attentionTrackerRef.current;
      if (tracker?.id === target.id && tracker.version === target.version) tracker.pendingActiveMs += activeMs;
      setMessage("That did not reach the agent. Try once more.");
      return false;
    }
    const receipt = (await response.json()) as { jobId?: number };
    const targetDraftKey = cardDraftKey(target);
    setFeedbackDrafts((current) => {
      const next = { ...current };
      delete next[targetDraftKey];
      return next;
    });
    setMessage(action === "no"
      ? "Skipped. This card is closed and the decision was saved."
      : `Job #${receipt.jobId ?? "?"} is queued with the full card. This card moved to Working. Here is the next new card.`);
    const targetView = action === "no" ? view : "new";
    const nextSelection = targetView === view
      ? nextCardAfterRemoval(target.id, visibleIdeas)
      : ideasForView(data.ideas, targetView)[0] ?? null;
    setView(targetView);
    setSelectedIdea(nextSelection);
    await load(targetView, { preferred: nextSelection, excludeId: target.id });
    return true;
  }, [data.ideas, load, takePendingActiveMs, view, visibleIdeas]);

  const handleCardAction = useCallback((payload: CardAction) => {
      if (!active) return;
      const label = payload.label?.slice(0, 120) || payload.action;
      const prompt = payload.prompt?.slice(0, 5000) || "";
      if (payload.action === "open") {
        if (!payload.url) return;
        recordCardInteraction(active, "open", label);
        const url = new URL(payload.url, window.location.origin);
        if (url.protocol === "http:" || url.protocol === "https:") window.open(url.href, "_blank", "noopener,noreferrer");
        return;
      }
      void sendToAgent(active, payload.action, label, prompt);
  }, [active, recordCardInteraction, sendToAgent]);

  const submitFeedback = useCallback(async () => {
    const note = feedback.trim();
    const target = active;
    if (!target || !note || jobInFlight || feedbackSubmitting) return;

    setFeedbackSubmitting(true);
    try {
      await sendToAgent(
        target,
        "change",
        "New context",
        "Use the user's new context to revise or follow up on this card. Re-read the current Agency skill and use the full stored card context. Complete every safe private step, re-estimate all four RISE components, push the finished replacement so the host can rank it, and stop at the exact outside-action boundary.",
        note,
      );
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [active, feedback, feedbackSubmitting, jobInFlight, sendToAgent]);

  const submitImprove = useCallback(async () => {
    if (!active || jobInFlight || feedbackSubmitting) return;

    setFeedbackSubmitting(true);
    try {
      await sendToAgent(
        active,
        "change",
        improveLabel(active),
        "Improve the actual work behind this card, not only the card wording. Re-read the current Agency and no-ai-slop skills, the full stored card context, General Context, and the user's accepted, changed, and rejected history. Critique the artifact against strong comparable work, then complete every safe private revision. For visuals, designs, videos, demos, pages, or launch assets, inspect the real output at desktop and 390 px and fix weak composition, hierarchy, polish, and clarity. For launch or social copy, preserve verified facts and the user's voice, make it shorter and more human, and keep the complete exact post visible. Re-estimate all four RISE components and push one materially better replacement so the host can rank it. Do not send, post, publish, merge, deploy, contact anyone, or return a cosmetic rewrite.",
      );
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [active, feedbackSubmitting, jobInFlight, sendToAgent]);

  const submitSkip = useCallback(async () => {
    if (!active || feedbackSubmitting) return;

    setFeedbackSubmitting(true);
    try {
      await sendToAgent(active, "no", "Skip");
    } finally {
      setFeedbackSubmitting(false);
    }
  }, [active, feedbackSubmitting, sendToAgent]);

  useEffect(() => {
    if (!active || composer) return;
    const shortcut = (event: KeyboardEvent) => {
      const action = cardShortcut({
        key: event.key,
        editable: event.composedPath().some((target) => target instanceof HTMLElement
          && (target.isContentEditable || target.matches("input, textarea, select"))),
        repeat: event.repeat,
        composing: event.isComposing,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
      });
      if (action === "skip") {
        event.preventDefault();
        void submitSkip();
      } else if (action === "improve") {
        event.preventDefault();
        void submitImprove();
      }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [active, composer, submitImprove, submitSkip]);

  async function saveGeneralContext() {
    const text = contextDraft.trim();
    if (!text) return;
    await fetch("/api/context", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text }) });
    setComposer(null);
    setMessage("General context saved.");
    await load();
  }

  async function queueTask() {
    const task = taskDraft.trim();
    if (!task) return;
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task, context: contextDraft.trim() }),
    });
    if (!response.ok) {
      setMessage("That task did not reach Agency. Try once more.");
      return;
    }
    const receipt = (await response.json()) as { jobId?: number };
    setComposer(null);
    setTaskDraft("");
    setView("new");
    setSelectedIdea(null);
    setMessage(`Task #${receipt.jobId ?? "?"} is queued. Agency has the full task and your general context.`);
    await load("new");
  }

  function move(direction: number) {
    if (!visibleIdeas.length) return;
    recordCardInteraction(active, direction > 0 ? "next" : "back", direction > 0 ? "Next card" : "Previous card");
    const currentIndex = active ? visibleIdeas.findIndex((idea) => idea.id === active.id) : -1;
    const startingIndex = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : 0;
    const nextIndex = (startingIndex + direction + visibleIdeas.length) % visibleIdeas.length;
    setSelectedIdea(visibleIdeas[nextIndex]);
    setMessage("");
  }

  function selectView(next: "new" | "working" | "done") {
    recordCardInteraction(active, "lane", next);
    setView(next);
    setSelectedIdea(ideasForView(data.ideas, next)[0] ?? null);
    setMessage("");
  }

  function updateFeedback(value: string) {
    if (!active) return;
    const key = cardDraftKey(active);
    setFeedbackDrafts((current) => ({ ...current, [key]: value }));
  }

  function showLatestSelected() {
    if (!latestSelected || feedback.trim()) return;
    recordCardInteraction(active, "update", "Show update");
    setView(latestSelected.status);
    setSelectedIdea(latestSelected);
    setMessage("");
  }

  function openNewTask() {
    recordCardInteraction(active, "new_task", "New Task");
    setTaskDraft("");
    setContextDraft(data.context?.text ?? "");
    setComposer("task");
  }

  function openGeneralContext() {
    recordCardInteraction(active, "context", "General context");
    setContextDraft(data.context?.text ?? "");
    setComposer("context");
  }

  if (loading) return <main className="radar-loading">Opening Agency…</main>;

  return (
    <main className="radar-shell">
      <header className="radar-header">
        <button className="radar-logo" onClick={() => selectView("new")}><span />AGENCY</button>
        <nav aria-label="Agency queue">
          <button aria-label={`New, ${laneCounts.new} tickets`} className={view === "new" ? "is-active" : ""} onClick={() => selectView("new")}>New <b>{laneCounts.new}</b></button>
          <button aria-label={`Working, ${laneCounts.working} tickets`} className={view === "working" ? "is-active" : ""} onClick={() => selectView("working")}>Working <b>{laneCounts.working}</b></button>
          <button aria-label={`Done, ${laneCounts.done} tickets`} className={view === "done" ? "is-active" : ""} onClick={() => selectView("done")}>Done <b>{laneCounts.done}</b></button>
        </nav>
        <button className="radar-tell" onClick={openNewTask}>+ New Task</button>
      </header>

      <button className="radar-goal" onClick={openGeneralContext}>
        <span>GENERAL CONTEXT</span>
        <strong>{data.context?.text || "Add what you care about."}</strong>
        <small>Change</small>
      </button>

      {composer === "task" ? (
        <section className="radar-task">
          <p>New task</p>
          <label>
            <span>What should Agency do?</span>
            <textarea value={taskDraft} onChange={(event) => setTaskDraft(event.target.value)} placeholder="One quick task…" />
          </label>
          <label className="is-context">
            <span>General context</span>
            <textarea value={contextDraft} onChange={(event) => setContextDraft(event.target.value)} placeholder="What do you care about right now?" />
          </label>
          <div><button onClick={() => setComposer(null)}>Cancel</button><button className="is-dark" disabled={!taskDraft.trim()} onClick={queueTask}>Queue task</button></div>
        </section>
      ) : composer === "context" ? (
        <section className="radar-context">
          <p>What do you care about?</p>
          <textarea value={contextDraft} onChange={(event) => setContextDraft(event.target.value)} placeholder="Your goal, project, people, or focus…" />
          <div><button onClick={() => setComposer(null)}>Cancel</button><button className="is-dark" disabled={!contextDraft.trim()} onClick={saveGeneralContext}>Save context</button></div>
        </section>
      ) : active ? (
        <>
          {hasIncomingUpdate && (
            <section className="radar-update-waiting" role="status">
              <span>{feedback.trim()
                ? "This card changed in the background. Your draft is pinned to the version you started on."
                : "This card changed in the background. It will not replace what you are reading."}</span>
              <button disabled={Boolean(feedback.trim())} onClick={showLatestSelected}>
                {feedback.trim() ? "Finish draft first" : "Show update"}
              </button>
            </section>
          )}
          {activeJob && (
            <section className={`radar-job is-${activeJob.status === "done" && activeJob.outcome === "review" ? "review" : activeJob.status ?? "unknown"}`} role="status">
              <strong>{activeJob.status === "queued"
                ? `Waiting · ${activeJob.label || `Job #${activeJob.id}`}`
                : activeJob.status === "running"
                  ? `Working · ${activeJob.label || `Job #${activeJob.id}`}`
                  : activeJob.status === "failed"
                    ? `Blocked · ${activeJob.label || `Job #${activeJob.id}`}`
                    : activeJob.outcome === "completed" || (!activeJob.outcome && activeLiveState?.status === "done")
                      ? `Done · ${activeJob.label || "Final step completed"}`
                      : `Ready to review · ${activeJob.label || "Agency update"}`}</strong>
              <span>{activeJob.status === "queued"
                ? "Queued for Agency."
                : activeJob.status === "running"
                  ? "The agent is doing the work now."
                  : activeJobSummary || (activeJob.status === "failed"
                    ? "The agent stopped without a note."
                    : activeJob.outcome === "completed"
                      ? "The agent completed the final action."
                      : "Agency updated the work for your review.")}</span>
              {activeJobHasMore && (
                <details>
                  <summary>Full agent result</summary>
                  <p>{activeJob.result}</p>
                </details>
              )}
            </section>
          )}
          <div className="radar-card-signals">
            <section
              className={`radar-decision-time${active.decisionAction ? "" : " is-live"}`}
              aria-label={active.decisionAction
                ? `${decisionLabel(active.decisionAction)} after ${formatDuration(active.decisionActiveMs)} active. Effort ${formatDuration(active.decisionEstimateMs)}.`
                : `${formatDuration(liveDecisionMs)} active. Effort ${formatDuration(active.decisionEstimateMs)}. ${active.decisionEstimateReason}.`}
              title={active.decisionAction
                ? `Effort ${formatDuration(active.decisionEstimateMs)}. Active time counts recent interaction; elapsed time includes breaks.`
                : `Effort is the predicted number of seconds you need. Based on ${active.decisionEstimateReason}, then tuned against recent ${decisionKindLabel(active.decisionKind)} decisions.`}
            >
              <strong>{active.decisionAction
                ? `${decisionLabel(active.decisionAction)} · ${formatDuration(active.decisionActiveMs)}`
                : formatDuration(liveDecisionMs)}</strong>
              <span>{active.decisionAction
                ? `Effort ${formatDuration(active.decisionEstimateMs)} · ${formatDuration(active.decisionWallMs)} elapsed`
                : `Effort ${formatDuration(active.decisionEstimateMs)} · ${decisionKindLabel(active.decisionKind)}`}</span>
            </section>
            <section
              className="radar-rise"
              aria-label={`RISE score ${active.score} out of 100. Reach ${active.riseReach}, impact ${active.riseImpact}, strategic fit ${active.riseStrategicFit}, execution readiness ${active.riseEase}.`}
              title="RISE = Reach · Impact · Strategic fit · Execution readiness"
            >
              <strong>RISE {active.score}</strong>
              <span>R {active.riseReach} · I {active.riseImpact} · S {active.riseStrategicFit} · E {active.riseEase}</span>
            </section>
          </div>
          <section className="radar-card-host">
            <AgentCard idea={active} actionable={!jobInFlight} onAction={handleCardAction} onInteraction={(action, label) => recordCardInteraction(active, action, label)} />
          </section>

          <section className="radar-inline-change">
            <textarea
              aria-label="Change this card"
              value={feedback}
              disabled={jobInFlight || feedbackSubmitting}
              onChange={(event) => updateFeedback(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                event.preventDefault();
                void submitFeedback();
              }}
              placeholder={jobInFlight || feedbackSubmitting
                ? "Agency is already changing this card."
                : "Add context or say what to change… Enter sends · Shift+Enter adds a line"}
            />
            <div className="radar-inline-actions">
              <button
                className="is-skip"
                disabled={feedbackSubmitting}
                aria-keyshortcuts="S"
                title="Shortcut: S"
                onClick={() => void submitSkip()}
              >Skip</button>
              <button
                className="is-improve"
                disabled={jobInFlight || feedbackSubmitting}
                aria-keyshortcuts="I"
                onClick={() => void submitImprove()}
                title="Shortcut: I · ask Agency to improve the finished work without more instructions"
              ><span aria-hidden="true">✦</span> {improveLabel(active)}</button>
              <button
                className="is-send"
                disabled={jobInFlight || feedbackSubmitting || !feedback.trim()}
                onClick={() => void submitFeedback()}
              >Send</button>
            </div>
          </section>

          {message && <div className="radar-message" role="status">{message}</div>}

          <div className="radar-next">
            <button onClick={() => move(-1)} aria-label="Previous card">← Back</button>
            <span>{selectedIndex >= 0 ? `${activeIndex + 1} of ${visibleIdeas.length}` : `Pinned · ${visibleIdeas.length} ${view}`}</span>
            <button onClick={() => move(1)} aria-label="Next card">Next →</button>
          </div>
        </>
      ) : (
        <section className="radar-empty"><strong>{view === "new" ? "No new cards." : view === "working" ? "No agents working." : "Nothing done yet."}</strong></section>
      )}

      <footer>
        <i /> {data.jobs.running ? `${data.jobs.running} running now` : data.jobs.queued ? `${data.jobs.queued} queued for the next Agency run` : "Agents ready"} · Private on this Mac
        <> · Done {data.completionStats.verified} verified{data.completionStats.legacy > 0 ? ` · ${data.completionStats.legacy} legacy` : ""}{data.completionStats.reviewReady > 0 ? ` · ${data.completionStats.reviewReady} ready to review` : ""}</>
        {data.decisionMetrics.tracked > 0 && <> · Accept p50 {formatDuration(data.decisionMetrics.medianAcceptedActiveMs)} · Any action p50 {formatDuration(data.decisionMetrics.medianFirstActionMs)} · Effort error ±{formatDuration(data.decisionMetrics.medianEstimateErrorMs)}{data.decisionMetrics.parked > 0 ? ` · ${data.decisionMetrics.parked} parked` : ""}</>}
        {data.decisionMetrics.tracked === 0 && <> · Decision timing starts now</>}
      </footer>
    </main>
  );
}

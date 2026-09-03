"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cardDraftKey, cardHasChanged, keepSelectedCard, nextCardAfterRemoval } from "../lib/card-focus";
import { cardShortcut } from "../lib/card-shortcut";
import { CLUSTERS, clusterForCard, type CardCluster } from "../lib/card-cluster";
import { compareByImpact, impactPoints } from "../lib/rise";

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
  createdAt: string;
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
  laneCounts: Record<Idea["status"], number>;
  jobs: { queued: number; running: number };
  completionStats: { verified: number; legacy: number; reviewReady: number; dismissed: number; points: number; pointsToday: number; verifiedToday: number };
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
  laneCounts: { new: 0, working: 0, done: 0 },
  jobs: { queued: 0, running: 0 },
  completionStats: { verified: 0, legacy: 0, reviewReady: 0, dismissed: 0, points: 0, pointsToday: 0, verifiedToday: 0 },
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


type SortMode = "score" | "newest";
const SORT_KEY = "radar-sort";

function readSortMode(): SortMode {
  try {
    return typeof window !== "undefined" && window.localStorage.getItem(SORT_KEY) === "newest" ? "newest" : "score";
  } catch {
    return "score";
  }
}

// Newest = the card an agent created or replaced most recently (created_at resets on every replacement).
function compareByNewest(left: Idea, right: Idea) {
  return (right.createdAt ?? "").localeCompare(left.createdAt ?? "") || right.id - left.id;
}

function ideasForView(ideas: Idea[], view: Idea["status"], sort: SortMode = "score") {
  return ideas.filter((idea) => idea.status === view).toSorted(sort === "newest" ? compareByNewest : compareByImpact);
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
  const dockRef = useRef<HTMLDivElement>(null);
  const onActionRef = useRef(onAction);
  const onInteractionRef = useRef(onInteraction);

  useEffect(() => {
    onActionRef.current = onAction;
    onInteractionRef.current = onInteraction;
  }, [onAction, onInteraction]);

  useEffect(() => {
    const host = hostRef.current;
    const dock = dockRef.current;
    if (!host || !dock) return;
    const root = host.shadowRoot ?? host.attachShadow({ mode: "open" });
    root.innerHTML = `<style>:host{display:block;font-family:inherit}*{box-sizing:border-box}[data-radar-action]{min-height:44px;cursor:pointer}[data-radar-action="open"]{display:inline-flex!important;align-items:center;gap:.38em}[data-radar-action="open"]::after{content:"↗";font-size:.8em;line-height:1;opacity:.68;transform:translateY(-.08em)}.radar-fallback-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.radar-fallback-actions{padding:0 20px 20px}.radar-fallback-actions button{min-height:40px;padding:0 16px;border:1px solid #e4e1da;border-radius:999px;background:#fff;color:#16150f;font:600 14px/1 inherit;cursor:pointer}.radar-fallback-actions button:first-child{background:#16150f;color:#fff;border-color:#16150f}</style>${idea.cardHtml}`;
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
    // Every action button stays inside the card HTML (Magnus, 2026-09-02): no host-level dock.
    dock.replaceChildren();
    dock.hidden = true;
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
    dock.addEventListener("click", click);
    return () => {
      root.removeEventListener("click", click);
      dock.removeEventListener("click", click);
    };
  }, [actionable, idea.id, idea.cardHtml]);

  return (
    <div className="radar-agent-card">
      <div className="radar-agent-card-scroll" ref={hostRef} />
      <div className="radar-card-action-dock" ref={dockRef} />
    </div>
  );
}


function dayKey(value: string | null) {
  if (!value) return "earlier";
  const date = new Date(value.includes("T") ? value : `${value.replace(" ", "T")}Z`);
  if (Number.isNaN(date.getTime())) return "earlier";
  return date.toLocaleDateString("en-CA");
}

function dayLabel(key: string) {
  if (key === "earlier") return "Earlier";
  const today = new Date().toLocaleDateString("en-CA");
  const yesterday = new Date(Date.now() - 86_400_000).toLocaleDateString("en-CA");
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  return new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function DoneList({ ideas, onAction, onInteraction }: { ideas: Idea[]; onAction: (idea: Idea, action: CardAction) => void; onInteraction: (idea: Idea, action: string, label: string) => void }) {
  const [day, setDay] = useState<string>("all");
  const [openId, setOpenId] = useState<number | null>(null);
  const [cardHtml, setCardHtml] = useState<Record<number, string>>({});
  useEffect(() => {
    if (!openId || cardHtml[openId]) return;
    let cancelled = false;
    fetch(`/api/state?view=done&only=${openId}`, { cache: "no-store" })
      .then((response) => response.json())
      .then((state: { ideas: Idea[] }) => {
        const html = state.ideas[0]?.cardHtml ?? "";
        if (!cancelled) setCardHtml((current) => ({ ...current, [openId]: html }));
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [openId, cardHtml]);
  const groups = useMemo(() => {
    const map = new Map<string, Idea[]>();
    for (const idea of ideas) {
      const key = dayKey(idea.jobUpdatedAt);
      map.set(key, [...(map.get(key) ?? []), idea]);
    }
    return [...map.entries()].toSorted(([a], [b]) => (a === "earlier" ? 1 : b === "earlier" ? -1 : a < b ? 1 : -1));
  }, [ideas]);
  const shown = day === "all" ? groups : groups.filter(([key]) => key === day);
  const pointsFor = (idea: Idea) => (idea.jobOutcome === "completed" ? impactPoints(idea) : 0);
  return (
    <section className="radar-done">
      <nav className="radar-done-days" aria-label="Filter done by day">
        <button className={day === "all" ? "is-active" : ""} onClick={() => setDay("all")}>All <b>{ideas.length}</b></button>
        {groups.slice(0, 8).map(([key, items]) => (
          <button key={key} className={day === key ? "is-active" : ""} onClick={() => setDay(key)}>{dayLabel(key)} <b>{items.length}</b></button>
        ))}
      </nav>
      <div className="radar-done-scroll">
        {shown.map(([key, items]) => (
          <section key={key} className="radar-done-day">
            <h2>{dayLabel(key)} <span>{items.length} done · {items.reduce((sum, idea) => sum + pointsFor(idea), 0)} pts</span></h2>
            <ul>
              {items.map((idea) => {
                const cluster = clusterForCard(idea);
                const open = openId === idea.id;
                return (
                  <li key={idea.id} className={open ? "is-open" : ""}>
                    <button className="radar-done-row" onClick={() => { setOpenId(open ? null : idea.id); onInteraction(idea, open ? "collapse" : "expand", "Done list"); }} aria-expanded={open}>
                      <i className={`is-${cluster}`} />
                      <strong>{idea.headline}</strong>
                      <span>{idea.jobLabel || decisionLabel(idea.decisionAction)}{idea.jobOutcome === "completed" ? " · verified" : idea.jobOutcome === "review" ? " · reviewed" : ""}{idea.decisionActiveMs ? ` · ${formatDuration(idea.decisionActiveMs)}` : ""}</span>
                      <em>{pointsFor(idea) ? `+${pointsFor(idea)}` : ""}</em>
                    </button>
                    {open && (
                      <div className="radar-done-card">
                        {idea.jobResult && <p className="radar-done-result">{summarizeJobResult(idea.jobResult)}</p>}
                        {cardHtml[idea.id] || idea.cardHtml
                          ? <AgentCard idea={{ ...idea, cardHtml: cardHtml[idea.id] || idea.cardHtml }} actionable={false} onAction={(action) => onAction(idea, action)} onInteraction={(action, label) => onInteraction(idea, action, label)} />
                          : <p className="radar-done-empty">Loading card…</p>}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        ))}
        {!shown.length && <p className="radar-done-empty">Nothing done on that day.</p>}
      </div>
    </section>
  );
}

export function GrowthRadar() {
  const [data, setData] = useState<RadarState>(emptyState);
  const [view, setView] = useState<"new" | "working" | "done">("new");
  const [cluster, setCluster] = useState<CardCluster | "all">("all");
  const [sort, setSort] = useState<SortMode>(readSortMode);
  const sortRef = useRef<SortMode>(sort);
  useEffect(() => {
    sortRef.current = sort;
    try { window.localStorage.setItem(SORT_KEY, sort); } catch { /* private mode */ }
  }, [sort]);
  const [selectedIdea, setSelectedIdea] = useState<Idea | null>(null);
  // Poll responses may resolve after the user has already moved to another card.
  // Keep the navigation anchor outside React's render timing so a refresh can
  // never replace the card the user is currently reading.
  const selectedIdeaRef = useRef<Idea | null>(null);
  const [composer, setComposer] = useState<"task" | "context" | null>(null);
  const [contextDraft, setContextDraft] = useState("");
  const [taskDraft, setTaskDraft] = useState("");
  const [feedbackDrafts, setFeedbackDrafts] = useState<Record<string, string>>({});
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [, setLiveDecision] = useState({ key: "", activeMs: 0 });
  const liveDecisionByCardRef = useRef<Record<string, number>>({});
  const attentionTrackerRef = useRef<AttentionTracker | null>(null);
  const loadRequestRef = useRef(0);
  // `?card=<id>` opens one exact card on first load, whatever lane it sits in.
  const deepLinkHandledRef = useRef(false);

  const selectIdea = useCallback((idea: Idea | null) => {
    selectedIdeaRef.current = idea;
    setSelectedIdea(idea);
  }, []);

  const load = useCallback(async (
    targetView: Idea["status"] = view,
    selection?: { preferred: Idea | null; excludeId?: number },
  ) => {
    const requestId = ++loadRequestRef.current;
    const stateUrl = new URL("/api/state", window.location.origin);
    stateUrl.searchParams.set("view", targetView);
    if (targetView === "done") stateUrl.searchParams.set("light", "1");
    const deepLinkedCardId = Number(new URLSearchParams(window.location.search).get("card"));
    const requestedCardId = selection?.preferred?.id
      ?? selectedIdeaRef.current?.id
      ?? (!deepLinkHandledRef.current && Number.isInteger(deepLinkedCardId) && deepLinkedCardId > 0 ? deepLinkedCardId : null);
    if (requestedCardId) stateUrl.searchParams.set("card", String(requestedCardId));
    const response = await fetch(stateUrl, { cache: "no-store" });
    const next = (await response.json()) as RadarState;
    if (requestId !== loadRequestRef.current) return;
    if (!deepLinkHandledRef.current) {
      deepLinkHandledRef.current = true;
      const requestedId = Number(new URLSearchParams(window.location.search).get("card"));
      const requested = next.ideas.find((idea) => idea.id === requestedId);
      if (requested) {
        setData(next);
        setView(requested.status);
        selectIdea(requested);
        setLoading(false);
        return;
      }
    }
    const visible = ideasForView(next.ideas, targetView, sortRef.current).filter((idea) => idea.id !== selection?.excludeId);
    setData(next);
    const anchor = selection ? selection.preferred : selectedIdeaRef.current;
    selectIdea(keepSelectedCard(anchor, visible));
    setLoading(false);
  }, [selectIdea, view]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!selectedIdea) return;
    const url = new URL(window.location.href);
    url.searchParams.set("card", String(selectedIdea.id));
    window.history.replaceState(null, "", url);
  }, [selectedIdea]);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const refresh = async () => {
      try {
        await load();
      } finally {
        if (!cancelled) timer = window.setTimeout(refresh, document.hidden ? 30000 : 10000);
      }
    };
    timer = window.setTimeout(refresh, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [load]);

  const laneIdeas = useMemo(() => ideasForView(data.ideas, view, sort), [data.ideas, view, sort]);
  const visibleIdeas = useMemo(
    () => (cluster === "all" ? laneIdeas : laneIdeas.filter((idea) => clusterForCard(idea) === cluster)),
    [laneIdeas, cluster],
  );
  const clusterCounts = useMemo(() => {
    const counts: Record<CardCluster, number> = { growth: 0, support: 0, fix: 0, product: 0 };
    for (const idea of laneIdeas) counts[clusterForCard(idea)] += 1;
    return counts;
  }, [laneIdeas]);
  function selectCluster(next: CardCluster | "all") {
    recordCardInteraction(active, "lane", `cluster:${next}`);
    setCluster(next);
    const nextVisible = next === "all" ? laneIdeas : laneIdeas.filter((idea) => clusterForCard(idea) === next);
    if (!active || !nextVisible.some((idea) => idea.id === active.id)) selectIdea(nextVisible[0] ?? null);
    setMessage("");
  }
  const laneCounts = data.laneCounts;
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
  const attentionIdeaId = active?.id ?? null;
  const attentionIdeaVersion = active?.version ?? null;
  const attentionDecisionAction = active?.decisionAction ?? null;
  const attentionInitialActiveMs = Number(active?.decisionActiveMs ?? 0);

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
      : ideasForView(data.ideas, targetView, sortRef.current)[0] ?? null;
    setView(targetView);
    selectIdea(nextSelection);
    await load(targetView, { preferred: nextSelection, excludeId: target.id });
    return true;
  }, [data.ideas, load, selectIdea, takePendingActiveMs, view, visibleIdeas]);

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
        "Improve the actual work behind this card, not only the card wording. Re-read the current Agency and no-ai-slop skills, the full stored card context, Things to Monitor/Stream, and the user's accepted, changed, and rejected history. Critique the artifact against strong comparable work, then complete every safe private revision. For visuals, designs, videos, demos, pages, or launch assets, inspect the real output at desktop and 390 px and fix weak composition, hierarchy, polish, and clarity. For launch or social copy, preserve verified facts and the user's voice, make it shorter and more human, and keep the complete exact post visible. Re-estimate all four RISE components and push one materially better replacement so the host can rank it. Do not send, post, publish, merge, deploy, contact anyone, or return a cosmetic rewrite.",
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
      } else if (action === "previous") {
        event.preventDefault();
        move(-1);
      } else if (action === "next") {
        event.preventDefault();
        move(1);
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
    setMessage("Things to Monitor/Stream saved.");
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
    selectIdea(null);
    setMessage(`Task #${receipt.jobId ?? "?"} is queued. Agency has the full task and your general context.`);
    await load("new");
  }

  function move(direction: number) {
    if (!visibleIdeas.length) return;
    recordCardInteraction(active, direction > 0 ? "next" : "back", direction > 0 ? "Next card" : "Previous card");
    const currentIndex = active ? visibleIdeas.findIndex((idea) => idea.id === active.id) : -1;
    const startingIndex = currentIndex >= 0 ? currentIndex : direction > 0 ? -1 : 0;
    const nextIndex = (startingIndex + direction + visibleIdeas.length) % visibleIdeas.length;
    selectIdea(visibleIdeas[nextIndex]);
    setMessage("");
  }

  function selectView(next: "new" | "working" | "done") {
    recordCardInteraction(active, "lane", next);
    setView(next);
    selectIdea(null);
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
    selectIdea(latestSelected);
    setMessage("");
  }

  function openNewTask() {
    recordCardInteraction(active, "new_task", "New Task");
    setTaskDraft("");
    setContextDraft(data.context?.text ?? "");
    setComposer("task");
  }

  function openGeneralContext() {
    recordCardInteraction(active, "context", "Things to Monitor/Stream");
    setContextDraft(data.context?.text ?? "");
    setComposer("context");
  }

  if (loading) return <main className="radar-loading">Opening Agency…</main>;

  return (
    <main className="radar-shell">
      <header className="radar-header">
        <div className="radar-bar-left">
          <button className="radar-logo" onClick={() => selectView("new")} aria-label="Agency"><span /></button>
          <button className="radar-tell" onClick={openNewTask}>New task</button>
          <nav aria-label="Agency queue">
            <button aria-label={`New, ${laneCounts.new} tickets`} className={view === "new" ? "is-active" : ""} onClick={() => selectView("new")}>New <b>{laneCounts.new}</b></button>
            <button aria-label={`Working, ${laneCounts.working} tickets`} className={view === "working" ? "is-active" : ""} onClick={() => selectView("working")}>Working <b>{laneCounts.working}</b></button>
            <button aria-label={`Done, ${laneCounts.done} tickets`} className={view === "done" ? "is-active" : ""} onClick={() => selectView("done")}>Done <b>{laneCounts.done}</b></button>
          </nav>
        </div>
        <div className="radar-header-actions">
          <button className="radar-goal" onClick={openGeneralContext} title={data.context?.text ? "Open your dream" : "Add what you care about."}>
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M8 1.5l1.9 4.1 4.4.5-3.3 3 .9 4.4L8 11.3l-3.9 2.2.9-4.4-3.3-3 4.4-.5z" fill="currentColor"/></svg>
            Dream
          </button>
          {active && composer === null && view !== "done" && (
            <span className="radar-score" title={`This card scores ${impactPoints(active)} of 10. Finishing it earns ${impactPoints(active)} points.`} aria-label={`Score ${impactPoints(active)} of 10`}><b>{impactPoints(active)}</b></span>
          )}
          <Link className="radar-points" href="/stats" aria-label={`${data.completionStats.points} points, ${data.completionStats.pointsToday} today. Open stats.`} title="Points from finished work. Opens stats."><b>{data.completionStats.points.toLocaleString("en-US")}</b><span>pts</span>{data.completionStats.pointsToday > 0 && <em>+{data.completionStats.pointsToday.toLocaleString("en-US")} today</em>}</Link>
        </div>
      </header>


      <nav className="radar-clusters" aria-label="Filter by kind of work">
        <div className="radar-sort" role="group" aria-label="Sort">
          <button className={sort === "newest" ? "is-active" : ""} onClick={() => { setSort("newest"); recordCardInteraction(active, "lane", "sort:newest"); }}>Newest</button>
          <button className={sort === "score" ? "is-active" : ""} onClick={() => { setSort("score"); recordCardInteraction(active, "lane", "sort:score"); }}>Score</button>
        </div>
        <button className={cluster === "all" ? "is-active" : ""} onClick={() => selectCluster("all")}>All <b>{laneIdeas.length}</b></button>
        {CLUSTERS.map((item) => (
          <button key={item.id} className={`is-${item.id}${cluster === item.id ? " is-active" : ""}`} title={item.hint} onClick={() => selectCluster(item.id)}>
            {item.label} <b>{clusterCounts[item.id]}</b>
          </button>
        ))}
      </nav>

      {composer === "task" ? (
        <section className="radar-task">
          <p>New task</p>
          <label>
            <span>What should Agency do?</span>
            <textarea value={taskDraft} onChange={(event) => setTaskDraft(event.target.value)} placeholder="One task, in your words. Agency carries your dream with it." />
          </label>
          <label className="is-context">
            <span>Dream</span>
            <textarea value={contextDraft} onChange={(event) => setContextDraft(event.target.value)} placeholder="What you are aiming at." />
          </label>
          <div><button onClick={() => setComposer(null)}>Cancel</button><button className="is-dark" disabled={!taskDraft.trim()} onClick={queueTask}>Queue task</button></div>
        </section>
      ) : composer === "context" ? (
        <section className="radar-context">
          <header>
            <p>Dream</p>
            <small>What you are aiming at, in your words. Agents read this before every wave.</small>
          </header>
          <textarea value={contextDraft} onChange={(event) => setContextDraft(event.target.value)} placeholder="e.g. Browser Use is the default browser agent everywhere. 300k sessions a week." />
          <footer>
            <span>{contextDraft.trim().length.toLocaleString("en-US")} characters{contextDraft.trim().length > 800 ? " · long enough that agents skim it" : ""}</span>
            <div><button onClick={() => setComposer(null)}>Cancel</button><button className="is-dark" disabled={!contextDraft.trim()} onClick={saveGeneralContext}>Save dream</button></div>
          </footer>
        </section>
      ) : view === "done" ? (
        <DoneList ideas={visibleIdeas} onAction={(idea, action) => { if (action.action === "open" && action.url) window.open(new URL(action.url, window.location.origin).toString(), "_blank", "noopener"); }} onInteraction={(idea, action, label) => recordCardInteraction(idea, action, label)} />
      ) : active ? (
        <section className="radar-workspace">
          {jobInFlight && <span className="radar-working" role="status">Agency is working on this card</span>}
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
          <section className="radar-card-host">
            <AgentCard idea={active} actionable={!jobInFlight} onAction={handleCardAction} onInteraction={(action, label) => recordCardInteraction(active, action, label)} />
          </section>

          <section className="radar-inline-change">
            <textarea
              aria-label="Change this card"
              value={feedback}
              rows={1}
              disabled={jobInFlight || feedbackSubmitting}
              onChange={(event) => { updateFeedback(event.target.value); event.target.style.height = "auto"; event.target.style.height = `${Math.min(event.target.scrollHeight, 180)}px`; }}
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
                aria-label="Skip this card"
                title="Skip · S"
                onClick={() => void submitSkip()}
              ><svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true"><path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none"/></svg></button>
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
                aria-label="Send"
                title="Send · Enter"
                onClick={() => void submitFeedback()}
              ><svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true"><path d="M8 13V3M3.5 7.5L8 3l4.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none"/></svg></button>
            </div>
          </section>

          {message && <div className="radar-message" role="status">{message}</div>}

          <div className="radar-next">
            <button onClick={() => move(-1)} aria-label="Previous card">← Back</button>
            <span>{selectedIndex >= 0 ? `${activeIndex + 1} of ${visibleIdeas.length}` : `Pinned · ${visibleIdeas.length} ${view}`}</span>
            <button onClick={() => move(1)} aria-label="Next card">Next →</button>
          </div>
        </section>
      ) : (
        <section className="radar-empty"><strong>{view === "new" ? "No new cards." : view === "working" ? "No agents working." : "Nothing done yet."}</strong></section>
      )}

      <footer className="radar-footer">
        <i /> {data.jobs.running ? `${data.jobs.running} agents working` : data.jobs.queued ? `${data.jobs.queued} queued` : "Agents ready"}
        {data.decisionMetrics.tracked > 0 && <> · you decide in {formatDuration(data.decisionMetrics.medianAcceptedActiveMs)} on average</>}
      </footer>
    </main>
  );
}

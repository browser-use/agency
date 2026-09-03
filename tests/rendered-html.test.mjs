import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the private growth radar", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /<title>Growth Radar<\/title>/i);
  assert.match(html, /Opening Agency/);
  assert.doesNotMatch(html, /codex-preview|react-loading-skeleton|Your site is taking shape/i);
});

test("removes starter-only files and metadata", async () => {
  const [page, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);
  assert.match(page, /GrowthRadar/);
  assert.match(layout, /title: "Growth Radar"/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  await assert.rejects(access(new URL("app/_sites-preview/SkeletonPreview.tsx", root)));
});

test("keeps card decisions fast and actionable", async () => {
  const [ui, styles, ingest, tasks, state, action, attention, agentJobs, database] = await Promise.all([
    readFile(new URL("../app/growth-radar.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ideas/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/tasks/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/state/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ideas/action/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/ideas/attention/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/agent-jobs/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../db/index.ts", import.meta.url), "utf8"),
  ]);
  assert.match(ui, />New task<\/button>/);
  assert.match(ui, /<span>Dream<\/span>/);
  assert.match(ui, /<span>Dream<\/span>/);
  assert.match(ui, /data\.completionStats\.points\.toLocaleString\("en-US"\)/);
  assert.match(styles, /\.radar-workspace \{ flex: 1 1 auto; min-height: 0; display: flex; flex-direction: column; overflow: hidden; \}/);
  assert.match(styles, /\.radar-card-host \{ flex: 1 1 auto; min-height: 120px; overflow: hidden/);
  assert.match(styles, /\.radar-agent-card-scroll \{ flex: 1 1 auto; min-height: 0; overflow: auto/);
  assert.match(styles, /\.radar-card-action-dock \{ flex: 0 0 58px/);
  assert.match(styles, /\.radar-inline-change \{ flex: 0 0 auto; min-height: 58px/);
  assert.match(styles, /\.radar-inline-change textarea \{[^}]*resize: none/);
  assert.match(ui, />Queue task<\/button>/);
  assert.match(ui, /fetch\("\/api\/tasks"/);
  assert.doesNotMatch(ui, /\+ New Context/);
  assert.match(ui, /setView\("new"\)/);
  assert.doesNotMatch(ui, /setView\("working"\)/);
  assert.match(ui, /const jobInFlight = activeJob\?\.status === "queued" \|\| activeJob\?\.status === "running"/);
  assert.match(ui, /const activeLiveState = latestSelected \?\? active/);
  assert.match(ui, /actionable=\{!jobInFlight\}/);
  assert.doesNotMatch(ui, /disabled=\{view === "working"/);
  assert.match(ui, /missingDo/);
  assert.doesNotMatch(ui, /missingChange|changeRequest/);
  assert.ok(ui.includes("root.querySelectorAll('[data-radar-action=\"change\"], [data-radar-action=\"no\"]')"));
  assert.match(ui, /Add context or say what to change/);
  assert.match(ui, /aria-label="Send"/);
  assert.match(ui, /sendToAgent\(\s*target,\s*"change"/);
  assert.match(ui, /function improveLabel\(idea: Idea\)/);
  assert.doesNotMatch(ui, /post\|launch\|tweet/);
  assert.match(ui, /Improve post/);
  assert.match(ui, /Improve demo/);
  assert.match(ui, /Improve design/);
  assert.match(ui, /Improve card/);
  assert.match(ui, /void submitImprove\(\)/);
  assert.match(ui, /void submitSkip\(\)/);
  assert.match(ui, /aria-label="Skip this card"/);
  assert.match(ui, /cardShortcut\(\{/);
  assert.match(ui, /event\.composedPath\(\)/);
  assert.match(ui, /target\.matches\("input, textarea, select"\)/);
  assert.match(ui, /if \(action === "skip"\)/);
  assert.match(ui, /else if \(action === "improve"\)/);
  assert.match(ui, /aria-keyshortcuts="S"/);
  assert.match(ui, /aria-keyshortcuts="I"/);
  assert.match(ui, /Improve the actual work behind this card, not only the card wording/);
  assert.match(ui, /Do not send, post, publish, merge, deploy, contact anyone/);
  assert.match(ui, /event\.key !== "Enter" \|\| event\.shiftKey \|\| event\.nativeEvent\.isComposing/);
  assert.match(ui, /void submitFeedback\(\)/);
  assert.match(ui, /Shift\+Enter adds a line/);
  assert.match(ui, /toSorted\(sort === "newest" \? compareByNewest : compareByImpact\)/);
  assert.match(ui, /ideasForView\(data\.ideas, view, sort\)/);
  assert.match(ui, /const laneCounts = data\.laneCounts/);
  assert.match(ui, /Done <b>\{laneCounts\.done\}<\/b>/);
  assert.match(ui, /aria-label=\{`Done, \$\{laneCounts\.done\} tickets`\}/);
  assert.match(ui, /function summarizeJobResult\(result: string\)/);
  assert.match(ui, /useState<Idea \| null>\(null\)/);
  assert.match(ui, /const selectedIdeaRef = useRef<Idea \| null>\(null\)/);
  assert.match(ui, /const loadRequestRef = useRef\(0\)/);
  assert.match(ui, /stateUrl\.searchParams\.set\("view", targetView\)/);
  assert.match(ui, /if \(requestId !== loadRequestRef\.current\) return/);
  assert.match(ui, /window\.setTimeout\(refresh, document\.hidden \? 30000 : 10000\)/);
  assert.match(ui, /const anchor = selection \? selection\.preferred : selectedIdeaRef\.current/);
  assert.match(ui, /selectIdea\(keepSelectedCard\(anchor, visible\)\)/);
  assert.match(ui, /nextCardAfterRemoval\(target\.id, visibleIdeas\)/);
  assert.match(ui, /excludeId: target\.id/);
  assert.match(ui, /selectIdea\(visibleIdeas\[nextIndex\]\)/);
  assert.match(ui, /feedbackDrafts/);
  assert.match(ui, /cardDraftKey\(active\)/);
  assert.match(ui, /This card changed while you were reading\. Your draft is still saved here/);
  assert.match(ui, /It will not replace what you are reading/);
  assert.doesNotMatch(ui, /setActiveIndex/);
  assert.match(ui, /const onActionRef = useRef\(onAction\)/);
  assert.match(ui, /onActionRef\.current\(\{/);
  assert.match(ui, /\[actionable, idea\.id, idea\.cardHtml\]/);
  assert.doesNotMatch(ui, /\[actionable, idea\.cardHtml, onAction\]/);
  assert.ok(ui.includes('[data-radar-action="open"]::after{content:"↗"'));
  assert.ok(ui.includes('button.title = "Opens a link"'));
  assert.doesNotMatch(ingest, /Every card needs a Change button/);
  assert.match(ingest, /Every card needs a meaningful next-step button/);
  assert.doesNotMatch(tasks, /data-radar-action="change"/);
  assert.match(tasks, /action, button_label, instruction/);
  assert.match(tasks, /'task', 'New Task'/);
  assert.match(tasks, /generalContext/);
  assert.match(state, /i\.status IN \('new', 'working', 'done'\)/);
  assert.match(state, /WHEN j\.status IN \('queued', 'running'\) THEN 'working'/);
  assert.match(state, /datetime\('now', '-48 hours'\)/);
  assert.match(state, /decision_source = 'user'/);
  assert.match(state, /interaction\.created_at <= a\.decided_at/);
  assert.match(state, /interaction\.action IN \('do', 'change', 'no', 'open', 'details'\)/);
  assert.match(state, /a\.decided_at IS NULL AND EXISTS/);
  assert.match(state, /i\.dedupe_key AS dedupeKey/);
  assert.match(state, /summarizeDecisionMetrics/);
  assert.match(state, /ticket_outcome = 'completed'/);
  assert.match(state, /reviewReady/);
  assert.match(state, /THEN CAST\(ROUND\(i\.rise_impact \/ 2\.5\) AS INTEGER\) ELSE 0 END\) AS points/);
  assert.match(state, /LEFT JOIN card_attention/);
  assert.match(state, /WHERE \(status = \? OR \(\? IS NOT NULL AND id = \?\)\) AND \(\? IS NULL OR id = \?\)/);
  assert.match(state, /ORDER BY score DESC, id DESC/);
  assert.match(state, /laneCounts/);
  assert.match(ingest, /Every card needs a RISE estimate/);
  assert.match(ingest, /decision_estimate_ms/);
  assert.match(ingest, /decision_estimate_reason/);
  assert.match(ui, /\/api\/ideas\/attention/);
  assert.match(ui, /document\.visibilityState === "visible"/);
  assert.match(ui, /document\.hasFocus\(\)/);
  assert.match(ui, /60_000/);
  assert.match(ui, /interactionAt - tracker\.lastInteractionAt > 60_000/);
  assert.match(ui, /decisionEstimateMs/);
  assert.match(ui, /totalActiveMs/);
  assert.match(ui, /takePendingActiveMs\(id, version, false\), 1_000/);
  assert.match(ui, /attentionDecisionAction/);
  assert.match(ui, /event: "interaction"/);
  assert.match(ui, /recordCardInteraction\(active, "open"/);
  assert.match(ui, /recordCardInteraction\(active, direction > 0 \? "next" : "back"/);
  assert.match(action, /decision_action/);
  assert.match(action, /wall_ms/);
  assert.match(action, /activeMs/);
  assert.match(action, /card_interactions/);
  assert.match(action, /version = \? AND status = \?/);
  assert.match(action, /status: 409/);
  assert.match(action, /if \(payload\.action === "no"\)/);
  assert.match(action, /return Response\.json\(\{ ok: true, status \}\)/);
  assert.ok(action.indexOf('if (payload.action === "no")') < action.indexOf("INSERT INTO agent_jobs"));
  assert.match(attention, /idea_version/);
  assert.match(attention, /WHERE id = \? AND version = \?/);
  assert.match(attention, /active_ms = card_attention\.active_ms \+ excluded\.active_ms/);
  assert.match(attention, /payload\.event === "interaction"/);
  assert.match(attention, /card_interactions/);
  assert.match(agentJobs, /ticket_outcome AS ticketOutcome/);
  assert.match(agentJobs, /resolveTicketOutcome/);
  assert.match(agentJobs, /ideaStatusForOutcome/);
  assert.match(agentJobs, /UPDATE ideas SET status = \?[\s\S]*WHERE id = \? AND status IN \('new', 'working'\)/);
  assert.match(database, /WHEN 'completed' THEN 'done'/);
  assert.match(database, /WHEN 'blocked' THEN 'new'/);
  assert.match(agentJobs, /status = 'running' AS reclaimed/);
  assert.match(agentJobs, /MAX_CONCURRENT_JOBS/);
  assert.match(agentJobs, /newer\.idea_id = job\.idea_id AND newer\.id > job\.id/);
  assert.match(agentJobs, /newer\.idea_id = \? AND newer\.id > \?/);
  assert.match(agentJobs, /canUpdateJob/);
  assert.match(action, /Agency is already working on this card/);
  assert.doesNotMatch(agentJobs, /status = 'new'/);
});

test("keeps every card action inside the card HTML (no host dock)", async () => {
  const source = await readFile(new URL("../app/growth-radar.tsx", import.meta.url), "utf8");
  assert.match(source, /dock\.hidden = true/);
  assert.doesNotMatch(source, /dock\.replaceChildren\(\.\.\.decisionButtons\)/);
});

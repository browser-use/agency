import { ensureDatabase } from "../../../db";
import { MAX_CONTEXT_LENGTH, MAX_TASK_LENGTH } from "../../../lib/task-submission";

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

function taskCard(task: string) {
  const safeTask = escapeHtml(task);
  return `<style>
    :host{display:block;color:#111;font-family:Arial,Helvetica,sans-serif}*{box-sizing:border-box}.card{min-height:650px;display:grid;grid-template-rows:auto 1fr auto;border:3px solid #111;border-radius:24px;background:#cfe1ff;box-shadow:10px 10px 0 #111;overflow:hidden}.top{display:flex;justify-content:space-between;padding:14px 18px;border-bottom:3px solid #111;background:#fff;font-size:13px;font-weight:900}.main{display:grid;align-content:center;gap:18px;padding:26px}.tag{width:max-content;padding:8px 11px;border:2px solid #111;border-radius:999px;background:#fff;font-size:13px;font-weight:900}h1{margin:0;font-size:clamp(42px,7vw,72px);line-height:.95;letter-spacing:-.055em;white-space:pre-wrap}.state{font-size:18px;font-weight:900}.actions{display:flex;flex-wrap:wrap;gap:8px;padding:16px 18px;border-top:3px solid #111;background:#fff}button{min-height:48px;padding:0 15px;border:2px solid #111;border-radius:12px;background:#fff;color:#111;font:inherit;font-weight:900}.go{background:#111;color:#fff}@media(max-width:620px){.card{box-shadow:6px 6px 0 #111}.main{padding:18px}h1{font-size:45px}.actions button{flex:1 1 45%}}
  </style>
  <article class="card">
    <header class="top"><span>YOUR TASK</span><span>QUEUED</span></header>
    <main class="main"><div class="tag">AGENCY HAS IT</div><h1>${safeTask}</h1><div class="state">You can keep looking at New cards.</div></main>
    <footer class="actions">
      <button class="go" data-radar-action="do" data-radar-prompt="Continue this user-created task from its full stored context. Re-read the current Agency skill, complete every safe private step, and return only when there is a finished result or a precise decision for the user. Do not repeat finished work or invent a next step.">Continue</button>
    </footer>
  </article>`;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Blocked origin" }, { status: 403 });
  const payload = (await request.json()) as { task?: string; context?: string };
  const task = payload.task?.trim() ?? "";
  const context = payload.context?.trim() ?? "";
  if (!task || task.length > MAX_TASK_LENGTH) return Response.json({ error: "Task must be 1–5000 characters." }, { status: 400 });
  if (context.length > MAX_CONTEXT_LENGTH) return Response.json({ error: "Context must be at most 40000 characters." }, { status: 400 });

  const db = await ensureDatabase();
  const latestContext = await db.prepare("SELECT text FROM contexts ORDER BY id DESC LIMIT 1").first<{ text: string }>();
  if (context && context !== latestContext?.text) {
    await db.prepare("INSERT INTO contexts (text) VALUES (?)").bind(context).run();
  }

  const taskKey = `user-task-${crypto.randomUUID()}`;
  const headline = task.replace(/\s+/g, " ").slice(0, 180);
  const agentContext = JSON.stringify({
    kind: "user_task",
    task,
    generalContext: context || latestContext?.text || "",
    source: "Agency New Task",
    boundary: "Complete safe private work first. Stop before an external, destructive, paid, merge, or deploy action unless the task explicitly and exactly approves it.",
  });
  const idea = await db.prepare("INSERT INTO ideas (project, category, headline, why_matters, impact, finished_work, primary_action, secondary_action, external_action, card_html, agent_context, score, rise_reach, rise_impact, rise_strategic_fit, rise_ease, source_label, source_url, agent_name, preview_kind, preview_title, preview_body, preview_asset, dedupe_key, status) VALUES ('Agency', 'Quick task', ?, '', '', '', '', '', '', ?, ?, 100, 25, 25, 25, 25, 'User-created task', '', 'Agency · Task Runner', 'html', '', '', '', ?, 'working') RETURNING id, version, project, category, headline, card_html AS cardHtml, agent_context AS agentContext, source_label AS sourceLabel, source_url AS sourceUrl, dedupe_key AS dedupeKey")
    .bind(headline, taskCard(task), agentContext, taskKey).first();
  if (!idea?.id) return Response.json({ error: "Task card could not be created." }, { status: 500 });

  const cardContext = JSON.stringify({
    idea,
    task: { request: task, generalContext: context || latestContext?.text || "", source: "New Task" },
    click: { action: "task", label: "New Task", instruction: task, note: "" },
  });
  const job = await db.prepare("INSERT INTO agent_jobs (idea_id, action, button_label, instruction, user_feedback, card_context) VALUES (?, 'task', 'New Task', ?, '', ?) RETURNING id")
    .bind(idea.id, task, cardContext).first();
  if (!job?.id) return Response.json({ error: "Task could not be queued." }, { status: 500 });

  return Response.json({ ok: true, ideaId: idea.id, jobId: job.id }, { status: 201 });
}

import { ensureDatabase } from "../../../db";
import { findProject, invalidProject, unknownProject } from "../../../db/projects";
import { requestProjectId } from "../../../lib/project";
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
    :host{display:block;font-family:system-ui,sans-serif;color:#202124}
    article{padding:28px}p{color:#61656a}h1{font-size:28px;line-height:1.3;white-space:pre-wrap;overflow-wrap:anywhere}
  </style><article><p>Task queued</p><h1>${safeTask}</h1></article>`;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Blocked origin" }, { status: 403 });
  const payload = (await request.json()) as { task?: string; context?: string; projectId?: string };
  const projectId = requestProjectId(request, payload.projectId);
  if (!projectId) return invalidProject();
  const task = payload.task?.trim() ?? "";
  const context = payload.context?.trim() ?? "";
  if (!task || task.length > MAX_TASK_LENGTH) return Response.json({ error: "Task must be 1–5000 characters." }, { status: 400 });
  if (context.length > MAX_CONTEXT_LENGTH) return Response.json({ error: "Context must be at most 40000 characters." }, { status: 400 });

  const db = await ensureDatabase();
  const project = await findProject(db, projectId);
  if (!project) return unknownProject(projectId);
  const latestContext = await db.prepare("SELECT text FROM contexts WHERE project_id = ? ORDER BY id DESC LIMIT 1").bind(projectId).first<{ text: string }>();
  if (context && context !== latestContext?.text) {
    await db.prepare("INSERT INTO contexts (project_id, text) VALUES (?, ?)").bind(projectId, context).run();
  }

  const taskKey = `user-task-${crypto.randomUUID()}`;
  const headline = task.replace(/\s+/g, " ").slice(0, 180);
  const agentContext = JSON.stringify({
    kind: "user_task",
    projectId,
    task,
    generalContext: context || latestContext?.text || "",
    source: "Agency New Task",
  });
  const idea = await db.prepare("INSERT INTO ideas (project_id, project, category, headline, why_matters, impact, finished_work, primary_action, secondary_action, external_action, card_html, agent_context, score, rise_reach, rise_impact, rise_strategic_fit, rise_ease, source_label, source_url, agent_name, preview_kind, preview_title, preview_body, preview_asset, dedupe_key, status) VALUES (?, ?, 'Quick task', ?, '', '', '', '', '', '', ?, ?, 0, 0, 0, 0, 0, 'User-created task', '', 'Agency · Task Runner', 'html', '', '', '', ?, 'working') RETURNING id, project_id AS projectId, project, category, headline, card_html AS cardHtml, agent_context AS agentContext, source_label AS sourceLabel, source_url AS sourceUrl, dedupe_key AS dedupeKey")
    .bind(projectId, project.label, headline, taskCard(task), agentContext, taskKey).first();
  if (!idea?.id) return Response.json({ error: "Task card could not be created." }, { status: 500 });

  const cardContext = JSON.stringify({
    idea,
    task: { projectId, request: task, generalContext: context || latestContext?.text || "", source: "New Task" },
    click: { action: "task", label: "New Task", instruction: task, note: "" },
  });
  const job = await db.prepare("INSERT INTO agent_jobs (idea_id, action, button_label, instruction, user_feedback, card_context) VALUES (?, 'task', 'New Task', ?, '', ?) RETURNING id")
    .bind(idea.id, task, cardContext).first();
  if (!job?.id) return Response.json({ error: "Task could not be queued." }, { status: 500 });

  return Response.json({ ok: true, ideaId: idea.id, jobId: job.id }, { status: 201 });
}

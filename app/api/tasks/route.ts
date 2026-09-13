import { ensureDatabase } from "../../../db";
import { MAX_CONTEXT_LENGTH, MAX_TASK_LENGTH } from "../../../lib/task-submission";
import { getAgentSettings } from "../../../lib/agent-settings";
import {
  AgentInputError,
  expectedRevisionMatches,
  parseNullableAgentSelection,
  readJsonObject,
  resolveAgentConfig,
  validateAgentSelection,
} from "../../../lib/agent-models";

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
  try {
    const payload = await readJsonObject(request);
    const task = typeof payload.task === "string" ? payload.task.trim() : "";
    const context = typeof payload.context === "string" ? payload.context.trim() : "";
    if (!task || task.length > MAX_TASK_LENGTH) throw new AgentInputError("Task must be 1–5000 characters.");
    if (context.length > MAX_CONTEXT_LENGTH) throw new AgentInputError("Context must be at most 40000 characters.");
    const agentSelection = payload.agentSelection === undefined
      ? null
      : parseNullableAgentSelection(payload.agentSelection, "agentSelection");
    let expectedSettingsRevision: number | undefined;
    if (payload.expectedSettingsRevision !== undefined) {
      expectedSettingsRevision = Number(payload.expectedSettingsRevision);
      if (!Number.isInteger(expectedSettingsRevision) || expectedSettingsRevision < 0) {
        throw new AgentInputError("expectedSettingsRevision must be a non-negative integer.");
      }
    }

    const db = await ensureDatabase();
    const settings = await getAgentSettings(db);
    if (!expectedRevisionMatches(expectedSettingsRevision, settings.revision)) {
      return Response.json({ error: "Agent settings changed while you were editing", settingsRevision: settings.revision }, { status: 409 });
    }
    if (agentSelection) validateAgentSelection(agentSelection, settings.models, "agentSelection");
    const agentConfig = resolveAgentConfig(settings, "execution", agentSelection, 0);
    const latestContext = await db.prepare("SELECT text FROM contexts ORDER BY id DESC LIMIT 1").first<{ text: string }>();
    const taskKey = `user-task-${crypto.randomUUID()}`;
    const headline = task.replace(/\s+/g, " ").slice(0, 180);
    const agentContext = JSON.stringify({
      kind: "user_task",
      task,
      generalContext: context || latestContext?.text || "",
      source: "Agency New Task",
    });
    const idea = await db.prepare(`
      INSERT INTO ideas (
        project, category, headline, why_matters, impact, finished_work,
        primary_action, secondary_action, external_action, card_html, agent_context,
        agent_selection, score, rise_reach, rise_impact, rise_strategic_fit,
        rise_ease, source_label, source_url, agent_name, preview_kind, preview_title,
        preview_body, preview_asset, dedupe_key, status
      )
      SELECT 'Agency', 'Quick task', ?, '', '', '', '', '', '', ?, ?, ?,
        0, 0, 0, 0, 0, 'User-created task', '', 'Agency · Task Runner',
        'html', '', '', '', ?, 'working'
      WHERE (? IS NULL OR (SELECT revision FROM agent_settings WHERE id = 1) = ?)
      RETURNING id, project, category, headline, card_html AS cardHtml,
        agent_context AS agentContext, source_label AS sourceLabel,
        source_url AS sourceUrl, dedupe_key AS dedupeKey
    `).bind(
      headline,
      taskCard(task),
      agentContext,
      agentSelection ? JSON.stringify(agentSelection) : null,
      taskKey,
      expectedSettingsRevision ?? null,
      expectedSettingsRevision ?? null,
    ).first<Record<string, unknown> & { id: number }>();
    if (!idea?.id) {
      const latest = await getAgentSettings(db);
      return Response.json({ error: "Agent settings changed while you were editing", settingsRevision: latest.revision }, { status: 409 });
    }

    const cardContext = JSON.stringify({
      idea: { ...idea, agentSelection, agentRevision: 0 },
      agentConfig,
      task: { request: task, generalContext: context || latestContext?.text || "", source: "New Task" },
      click: { action: "task", label: "New Task", instruction: task, note: "" },
    });
    const job = await db.prepare(`
      INSERT INTO agent_jobs (
        idea_id, action, button_label, instruction, user_feedback, card_context, agent_config
      )
      SELECT ?, 'task', 'New Task', ?, '', ?, ?
      WHERE (? IS NULL OR (SELECT revision FROM agent_settings WHERE id = 1) = ?)
      RETURNING id
    `).bind(
      idea.id,
      task,
      cardContext,
      agentConfig ? JSON.stringify(agentConfig) : null,
      expectedSettingsRevision ?? null,
      expectedSettingsRevision ?? null,
    ).first<{ id: number }>();
    if (!job?.id) {
      await db.prepare("DELETE FROM ideas WHERE id = ? AND status = 'working' AND NOT EXISTS (SELECT 1 FROM agent_jobs WHERE idea_id = ?)")
        .bind(idea.id, idea.id).run();
      const latest = await getAgentSettings(db);
      return Response.json({ error: "Agent settings changed before the task was queued", settingsRevision: latest.revision }, { status: 409 });
    }
    if (context && context !== latestContext?.text) {
      await db.prepare("INSERT INTO contexts (text) VALUES (?)").bind(context).run();
    }

    return Response.json({ ok: true, ideaId: idea.id, jobId: job.id }, { status: 201 });
  } catch (error) {
    if (error instanceof AgentInputError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

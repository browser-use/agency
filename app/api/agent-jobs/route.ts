import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../db";
import {
  AgentInputError,
  agentRunMatchesConfig,
  parseAgentRun,
  parseStoredAgentConfig,
  parseStoredAgentRun,
  readJsonObject,
  type AgentRun,
} from "../../../lib/agent-models";
import { canUpdateJob, ideaStatusForOutcome, jobLeaseWindow, MAX_CONCURRENT_JOBS, resolveTicketOutcome, type StoredJobStatus, type TicketOutcome } from "../../../lib/job-lifecycle";

function canUseQueue(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) return origin === new URL(request.url).origin;
  const url = new URL(request.url);
  const loopback = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (loopback && request.headers.get("x-radar-local-agent") === "1") return true;
  const expected = (env as unknown as { RADAR_AGENT_KEY?: string }).RADAR_AGENT_KEY;
  return Boolean(expected) && request.headers.get("x-radar-agent-key") === expected;
}

export async function GET(request: Request) {
  if (!canUseQueue(request)) return Response.json({ error: "Missing agent key" }, { status: 401 });
  const db = await ensureDatabase();
  const leaseWindow = jobLeaseWindow();
  const jobs = await db.prepare(`
    WITH latest_jobs AS (
      SELECT job.*
      FROM agent_jobs job
      WHERE NOT EXISTS (
        SELECT 1 FROM agent_jobs newer
        WHERE newer.idea_id = job.idea_id AND newer.id > job.id
      )
    ), capacity AS (
      SELECT MAX(0, ? - COUNT(*)) AS slots
      FROM latest_jobs
      WHERE status = 'running' AND updated_at > datetime('now', ?)
    )
    SELECT
      id,
      idea_id AS ideaId,
      action,
      button_label AS buttonLabel,
      instruction,
      user_feedback AS userFeedback,
      card_context AS cardContext,
      agent_config AS storedAgentConfig,
      agent_run AS storedAgentRun,
      ticket_outcome AS ticketOutcome,
      'queued' AS status,
      status = 'running' AS reclaimed,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM latest_jobs
    WHERE status = 'queued'
      OR (status = 'running' AND updated_at <= datetime('now', ?))
    ORDER BY status = 'running' ASC, id ASC
    LIMIT (SELECT slots FROM capacity)
  `).bind(MAX_CONCURRENT_JOBS, leaseWindow, leaseWindow).all<{ id: number; ideaId: number } & Record<string, unknown>>();
  // Include earlier feedback and results so the agent can continue from context.
  const history = await Promise.all(jobs.results.map(async (job: { id: number; ideaId: number } & Record<string, unknown>) => {
    const rows = await db.prepare(`
      SELECT id, action, button_label AS buttonLabel, user_feedback AS note, status, ticket_outcome AS outcome,
             substr(result, 1, 600) AS result, created_at AS createdAt
      FROM agent_jobs WHERE idea_id = ? AND id < ? ORDER BY id ASC
    `).bind(job.ideaId, job.id).all();
    return rows.results;
  }));
  return Response.json({ jobs: jobs.results.map((job: { id: number; ideaId: number } & Record<string, unknown>, index: number) => {
    const { storedAgentConfig, storedAgentRun, ...publicJob } = job;
    return {
      ...publicJob,
      agentConfig: parseStoredAgentConfig(storedAgentConfig as string | null),
      agentRun: parseStoredAgentRun(storedAgentRun as string | null),
      history: history[index],
    };
  }) });
}

export async function POST(request: Request) {
  if (!canUseQueue(request)) return Response.json({ error: "Missing agent key" }, { status: 401 });
  try {
    const payload = await readJsonObject(request);
    const id = Number(payload.id);
    const status = payload.status;
    if (!Number.isInteger(id) || id < 1 || !["running", "done", "failed"].includes(String(status))) {
      throw new AgentInputError("Invalid job update");
    }
    const ticketOutcomeInput = payload.ticketOutcome as TicketOutcome | undefined;
    if (ticketOutcomeInput && !["completed", "review", "blocked"].includes(ticketOutcomeInput)) {
      throw new AgentInputError("Invalid ticket outcome");
    }
    if (status === "done" && ticketOutcomeInput === "blocked") throw new AgentInputError("A done job cannot be blocked");
    if (status === "failed" && ticketOutcomeInput && ticketOutcomeInput !== "blocked") {
      throw new AgentInputError("A failed job must be blocked");
    }
    const result = typeof payload.result === "string" ? payload.result.slice(0, 20_000) : "";
    let agentRun: AgentRun | null = null;
    if (payload.agentRun !== undefined) agentRun = parseAgentRun(payload.agentRun);
    const db = await ensureDatabase();
    const job = await db.prepare(`
      SELECT idea_id AS ideaId, action, status, agent_config AS storedAgentConfig, agent_run AS storedAgentRun
      FROM agent_jobs WHERE id = ?
    `).bind(id).first<{
      ideaId: number;
      action: string;
      status: StoredJobStatus;
      storedAgentConfig: string | null;
      storedAgentRun: string | null;
    }>();
    if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
    if (job.status === status && (job.status === "done" || job.status === "failed")) {
      return Response.json({ ok: true });
    }
    const dispatchFailure = payload.failureStage === "dispatch"
      && job.status === "queued" && status === "failed" && ticketOutcomeInput === "blocked"
      && !job.storedAgentRun && !agentRun && result.trim().length > 0;
    if (payload.failureStage !== undefined && !dispatchFailure) {
      throw new AgentInputError("A dispatch failure requires a queued, unstarted job, a blocked outcome, a reason, and no agentRun.");
    }
    if (!dispatchFailure && !canUpdateJob(job.status, status as Exclude<StoredJobStatus, "queued">)) {
      return Response.json({ error: `Job is already ${job.status}` }, { status: 409 });
    }
    if (status === "running" && job.storedAgentConfig) {
      const config = parseStoredAgentConfig(job.storedAgentConfig);
      if (!config) return Response.json({ error: "Job model configuration is invalid" }, { status: 409 });
      if (!agentRun || !agentRunMatchesConfig(agentRun, config)) {
        return Response.json({ error: "Worker runtime does not match the queued model configuration", agentConfig: config }, { status: 409 });
      }
    }
    const ticketOutcome = resolveTicketOutcome(status as Exclude<StoredJobStatus, "queued">, ticketOutcomeInput);
    const updated = await db.prepare(`
      UPDATE agent_jobs
      SET status = ?, result = ?, ticket_outcome = ?,
          agent_run = CASE WHEN ? = 'running' THEN ? ELSE agent_run END,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND status = ?
      RETURNING id
    `).bind(
      status,
      result,
      ticketOutcome,
      status,
      status === "running" && agentRun ? JSON.stringify(agentRun) : null,
      id,
      job.status,
    ).first();
    if (!updated) return Response.json({ error: "Job changed before the update was saved" }, { status: 409 });
    if ((status === "done" || status === "failed") && job.action !== "no") {
      const ideaStatus = ideaStatusForOutcome(ticketOutcome);
      await db.prepare(`
        UPDATE ideas SET status = ?
        WHERE id = ? AND status IN ('new', 'working')
          AND NOT EXISTS (
            SELECT 1 FROM agent_jobs newer
            WHERE newer.idea_id = ? AND newer.id > ?
          )
      `).bind(ideaStatus, job.ideaId, job.ideaId, id).run();
    }
    return Response.json({ ok: true, ticketOutcome, ideaStatus: ideaStatusForOutcome(ticketOutcome) });
  } catch (error) {
    if (error instanceof AgentInputError) return Response.json({ error: error.message }, { status: 400 });
    throw error;
  }
}

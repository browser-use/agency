import { env } from "cloudflare:workers";
import { ensureDatabase } from "../../../db";
import { invalidProject } from "../../../db/projects";
import { parseProjectId } from "../../../lib/project";
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
  // `?project=<id>` narrows the queue to one project; without it every project's jobs are listed.
  const requestedProject = new URL(request.url).searchParams.get("project");
  const projectId = requestedProject ? parseProjectId(requestedProject) : null;
  if (requestedProject && !projectId) return invalidProject();
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
      j.id,
      j.idea_id AS ideaId,
      i.project_id AS projectId,
      j.action,
      j.button_label AS buttonLabel,
      j.instruction,
      j.user_feedback AS userFeedback,
      j.card_context AS cardContext,
      j.ticket_outcome AS ticketOutcome,
      'queued' AS status,
      j.status = 'running' AS reclaimed,
      j.created_at AS createdAt,
      j.updated_at AS updatedAt
    FROM latest_jobs j
    LEFT JOIN ideas i ON i.id = j.idea_id
    WHERE (j.status = 'queued' OR (j.status = 'running' AND j.updated_at <= datetime('now', ?)))
      AND (? IS NULL OR i.project_id = ?)
    ORDER BY j.status = 'running' ASC, j.id ASC
    LIMIT (SELECT slots FROM capacity)
  `).bind(MAX_CONCURRENT_JOBS, leaseWindow, leaseWindow, projectId, projectId).all<{ id: number; ideaId: number } & Record<string, unknown>>();
  // Include earlier feedback and results so the agent can continue from context.
  const history = await Promise.all(jobs.results.map(async (job) => {
    const rows = await db.prepare(`
      SELECT id, action, button_label AS buttonLabel, user_feedback AS note, status, ticket_outcome AS outcome,
             substr(result, 1, 600) AS result, created_at AS createdAt
      FROM agent_jobs WHERE idea_id = ? AND id < ? ORDER BY id ASC
    `).bind(job.ideaId, job.id).all();
    return rows.results;
  }));
  return Response.json({ jobs: jobs.results.map((job, index) => ({ ...job, history: history[index] })) });
}

export async function POST(request: Request) {
  if (!canUseQueue(request)) return Response.json({ error: "Missing agent key" }, { status: 401 });
  const payload = (await request.json()) as { id?: number; status?: "running" | "done" | "failed"; result?: string; ticketOutcome?: TicketOutcome };
  if (!payload.id || !["running", "done", "failed"].includes(payload.status ?? "")) return Response.json({ error: "Invalid job update" }, { status: 400 });
  if (payload.ticketOutcome && !["completed", "review", "blocked"].includes(payload.ticketOutcome)) return Response.json({ error: "Invalid ticket outcome" }, { status: 400 });
  if (payload.status === "done" && payload.ticketOutcome === "blocked") return Response.json({ error: "A done job cannot be blocked" }, { status: 400 });
  if (payload.status === "failed" && payload.ticketOutcome && payload.ticketOutcome !== "blocked") return Response.json({ error: "A failed job must be blocked" }, { status: 400 });
  const db = await ensureDatabase();
  const job = await db.prepare("SELECT idea_id AS ideaId, action, status FROM agent_jobs WHERE id = ?").bind(payload.id).first<{ ideaId: number; action: string; status: StoredJobStatus }>();
  if (!job) return Response.json({ error: "Job not found" }, { status: 404 });
  if (job.status === payload.status && (job.status === "done" || job.status === "failed")) {
    return Response.json({ ok: true });
  }
  if (!canUpdateJob(job.status, payload.status!)) {
    return Response.json({ error: `Job is already ${job.status}` }, { status: 409 });
  }
  const ticketOutcome = resolveTicketOutcome(payload.status!, payload.ticketOutcome);
  const updates = [
    db.prepare("UPDATE agent_jobs SET status = ?, result = ?, ticket_outcome = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?")
      .bind(payload.status, payload.result?.slice(0, 20_000) ?? "", ticketOutcome, payload.id, job.status),
  ];
  if ((payload.status === "done" || payload.status === "failed") && job.action !== "no") {
    const ideaStatus = ideaStatusForOutcome(ticketOutcome);
    updates.push(db.prepare(`
      UPDATE ideas SET status = ?
      WHERE id = ? AND status IN ('new', 'working')
        AND NOT EXISTS (
          SELECT 1 FROM agent_jobs newer
          WHERE newer.idea_id = ? AND newer.id > ?
        )
    `).bind(ideaStatus, job.ideaId, job.ideaId, payload.id));
  }
  await db.batch(updates);
  return Response.json({ ok: true, ticketOutcome, ideaStatus: ideaStatusForOutcome(ticketOutcome) });
}

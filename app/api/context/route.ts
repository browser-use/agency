import { ensureDatabase } from "../../../db";
import { findProject, invalidProject, unknownProject } from "../../../db/projects";
import { requestProjectId } from "../../../lib/project";
import { MAX_CONTEXT_LENGTH } from "../../../lib/task-submission";

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return Response.json({ error: "Blocked origin" }, { status: 403 });
  const payload = (await request.json()) as { text?: string; projectId?: string };
  const projectId = requestProjectId(request, payload.projectId);
  if (!projectId) return invalidProject();
  const text = payload.text?.trim() ?? "";
  if (!text || text.length > MAX_CONTEXT_LENGTH) return Response.json({ error: "Context must be 1–40000 characters." }, { status: 400 });
  const db = await ensureDatabase();
  if (!(await findProject(db, projectId))) return unknownProject(projectId);
  await db.prepare("INSERT INTO contexts (project_id, text) VALUES (?, ?)").bind(projectId, text).run();
  return Response.json({ ok: true }, { status: 201 });
}

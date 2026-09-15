import { ensureDatabase } from "../../../db";
import { findProject, invalidProject, unknownProject } from "../../../db/projects";
import { requestProjectId } from "../../../lib/project";
import { parseTopicRow } from "../../../lib/card-cluster";

function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || origin === new URL(request.url).origin;
}

function slug(label: string) {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "topic";
}

export async function GET(request: Request) {
  const projectId = requestProjectId(request);
  if (!projectId) return invalidProject();
  const db = await ensureDatabase();
  const rows = await db.prepare("SELECT id, label, hint FROM topics WHERE project_id = ? ORDER BY position, created_at").bind(projectId).all<{ id: string; label: string; hint: string }>();
  return Response.json({ topics: rows.results.map(parseTopicRow) });
}

/** Create or update a topic. Agents may call this too (same loopback rule as cards). */
export async function POST(request: Request) {
  if (!isSameOrigin(request) && request.headers.get("x-radar-local-agent") !== "1") return Response.json({ error: "Blocked origin" }, { status: 403 });
  const payload = (await request.json()) as { id?: string; label?: string; hint?: string; projectId?: string };
  const projectId = requestProjectId(request, payload.projectId);
  if (!projectId) return invalidProject();
  const label = payload.label?.trim().slice(0, 40) ?? "";
  if (!label) return Response.json({ error: "A topic needs a label." }, { status: 400 });
  const id = (payload.id?.trim() || slug(label)).slice(0, 40);
  const hint = payload.hint?.trim().slice(0, 120) ?? "";
  const db = await ensureDatabase();
  if (!(await findProject(db, projectId))) return unknownProject(projectId);
  await db.prepare(`
    INSERT INTO topics (project_id, id, label, hint, position)
    VALUES (?, ?, ?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM topics WHERE project_id = ?))
    ON CONFLICT(project_id, id) DO UPDATE SET label = excluded.label, hint = excluded.hint
  `).bind(projectId, id, label, hint, projectId).run();
  return Response.json({ ok: true, id }, { status: 201 });
}

/** Delete a topic. Cards keep their category text; they simply show under All until refiled. */
export async function DELETE(request: Request) {
  if (!isSameOrigin(request) && request.headers.get("x-radar-local-agent") !== "1") return Response.json({ error: "Blocked origin" }, { status: 403 });
  const projectId = requestProjectId(request);
  if (!projectId) return invalidProject();
  const id = new URL(request.url).searchParams.get("id")?.trim() ?? "";
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  const db = await ensureDatabase();
  await db.prepare("DELETE FROM topics WHERE project_id = ? AND id = ?").bind(projectId, id).run();
  return Response.json({ ok: true });
}

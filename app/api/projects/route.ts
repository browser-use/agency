import { ensureDatabase } from "../../../db";
import { findProject, invalidProject, listProjects } from "../../../db/projects";
import { DEFAULT_PROJECT_ID, MAX_PROJECT_LABEL_LENGTH, parseProjectId, projectSlug } from "../../../lib/project";

function canWrite(request: Request) {
  const origin = request.headers.get("origin");
  if (origin) return origin === new URL(request.url).origin;
  return request.headers.get("x-radar-local-agent") === "1";
}

export async function GET() {
  const db = await ensureDatabase();
  return Response.json({ projects: await listProjects(db) });
}

/** Create a project, or rename one by passing its existing id. Agents may call this too. */
export async function POST(request: Request) {
  if (!canWrite(request)) return Response.json({ error: "Blocked origin" }, { status: 403 });
  const payload = (await request.json()) as { id?: string; label?: string };
  const label = payload.label?.trim().slice(0, MAX_PROJECT_LABEL_LENGTH) ?? "";
  if (!label) return Response.json({ error: "A project needs a name." }, { status: 400 });
  const explicitId = payload.id !== undefined && payload.id !== "";
  const id = explicitId ? parseProjectId(payload.id) : parseProjectId(projectSlug(label));
  if (!id) return invalidProject();
  const db = await ensureDatabase();
  if (explicitId) {
    await db.prepare(`
      INSERT INTO projects (id, label, position)
      VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM projects))
      ON CONFLICT(id) DO UPDATE SET label = excluded.label
    `).bind(id, label).run();
    return Response.json({ ok: true, id }, { status: 201 });
  }
  // Without an id this is a create: never rename an existing project by accident.
  const created = await db.prepare(`
    INSERT INTO projects (id, label, position)
    VALUES (?, ?, (SELECT COALESCE(MAX(position), 0) + 1 FROM projects))
    ON CONFLICT(id) DO NOTHING
    RETURNING id
  `).bind(id, label).first<{ id: string }>();
  if (!created) return Response.json({ error: `A project with the id "${id}" already exists.` }, { status: 409 });
  return Response.json({ ok: true, id }, { status: 201 });
}

/** Delete an empty project with its dream history and topics. Projects with cards are kept. */
export async function DELETE(request: Request) {
  if (!canWrite(request)) return Response.json({ error: "Blocked origin" }, { status: 403 });
  const id = parseProjectId(new URL(request.url).searchParams.get("id"));
  if (!id) return invalidProject();
  if (id === DEFAULT_PROJECT_ID) return Response.json({ error: "The default project cannot be removed." }, { status: 400 });
  const db = await ensureDatabase();
  const project = await findProject(db, id);
  if (!project) return Response.json({ ok: true });
  if (project.cards > 0) {
    return Response.json({ error: `This project still has ${project.cards} cards. Only empty projects can be removed.` }, { status: 409 });
  }
  await db.batch([
    db.prepare("DELETE FROM topics WHERE project_id = ?").bind(id),
    db.prepare("DELETE FROM contexts WHERE project_id = ?").bind(id),
    db.prepare("DELETE FROM projects WHERE id = ? AND NOT EXISTS (SELECT 1 FROM ideas WHERE project_id = ?)").bind(id, id),
  ]);
  return Response.json({ ok: true });
}

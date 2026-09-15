import type { getD1 } from ".";
import type { Project } from "../lib/project";

type Database = ReturnType<typeof getD1>;

// `open` matches the New lane: new cards without a queued or running job.
const PROJECT_SELECT = `
  SELECT
    p.id,
    p.label,
    (
      SELECT COUNT(*) FROM ideas i
      WHERE i.project_id = p.id AND i.card_html != '' AND i.status = 'new'
        AND NOT EXISTS (SELECT 1 FROM agent_jobs j WHERE j.idea_id = i.id AND j.status IN ('queued', 'running'))
    ) AS open,
    (SELECT COUNT(*) FROM ideas i WHERE i.project_id = p.id) AS cards
  FROM projects p
`;

export async function listProjects(db: Database) {
  const rows = await db.prepare(`${PROJECT_SELECT} ORDER BY p.position, p.created_at`).all<Project>();
  return rows.results;
}

export async function findProject(db: Database, id: string) {
  return db.prepare(`${PROJECT_SELECT} WHERE p.id = ?`).bind(id).first<Project>();
}

export function unknownProject(id: string) {
  return Response.json({ error: `Unknown project "${id}". Create it in Settings or with POST /api/projects.` }, { status: 404 });
}

export function invalidProject() {
  return Response.json({ error: "A project id is 1–40 lowercase letters, digits or dashes." }, { status: 400 });
}

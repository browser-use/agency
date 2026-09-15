import { env } from "cloudflare:workers";
import { DEFAULT_PROJECT_ID } from "../lib/project";

export function getD1() {
  if (!env.DB) throw new Error("The local Agency database is unavailable.");
  return env.DB;
}

// Schema checks, migrations, and the status reconcile are idempotent but cost
// ~1.5 s per call. Run them once per process and then at most once a minute;
// every other request gets the handle straight back.
const MAINTENANCE_INTERVAL_MS = 60_000;
let lastMaintenanceAt = 0;
let maintenance: Promise<void> | null = null;

export async function ensureDatabase() {
  const db = getD1();
  const now = Date.now();
  if (!maintenance || now - lastMaintenanceAt > MAINTENANCE_INTERVAL_MS) {
    lastMaintenanceAt = now;
    maintenance = runMaintenance(db).catch((error) => {
      maintenance = null;
      throw error;
    });
  }
  await maintenance;
  return db;
}

const TOPICS_COLUMNS = `project_id TEXT NOT NULL DEFAULT '${DEFAULT_PROJECT_ID}', id TEXT NOT NULL, label TEXT NOT NULL, hint TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (project_id, id)`;

async function runMaintenance(db: ReturnType<typeof getD1>) {
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS contexts (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS ideas (id INTEGER PRIMARY KEY AUTOINCREMENT, headline TEXT NOT NULL, why_matters TEXT NOT NULL, impact TEXT NOT NULL, finished_work TEXT NOT NULL, primary_action TEXT NOT NULL, external_action TEXT NOT NULL, score INTEGER NOT NULL, rise_reach INTEGER NOT NULL DEFAULT 0, rise_impact INTEGER NOT NULL DEFAULT 0, rise_strategic_fit INTEGER NOT NULL DEFAULT 0, rise_ease INTEGER NOT NULL DEFAULT 0, decision_estimate_ms INTEGER NOT NULL DEFAULT 0, decision_estimate_reason TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, source_label TEXT NOT NULL, source_url TEXT NOT NULL, agent_name TEXT NOT NULL, preview_kind TEXT NOT NULL, preview_title TEXT NOT NULL, preview_body TEXT NOT NULL, preview_asset TEXT NOT NULL DEFAULT '', dedupe_key TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'new', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS feedback (id INTEGER PRIMARY KEY AUTOINCREMENT, idea_id INTEGER NOT NULL, decision TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS agent_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, idea_id INTEGER NOT NULL, action TEXT NOT NULL, button_label TEXT NOT NULL, instruction TEXT NOT NULL DEFAULT '', user_feedback TEXT NOT NULL DEFAULT '', card_context TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'queued', result TEXT NOT NULL DEFAULT '', ticket_outcome TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE TABLE IF NOT EXISTS card_attention (idea_id INTEGER NOT NULL, idea_version INTEGER NOT NULL, first_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, active_ms INTEGER NOT NULL DEFAULT 0, view_count INTEGER NOT NULL DEFAULT 0, decision_action TEXT, decision_label TEXT NOT NULL DEFAULT '', decision_source TEXT NOT NULL DEFAULT 'user', decided_at TEXT, wall_ms INTEGER, PRIMARY KEY (idea_id, idea_version))"),
    db.prepare("CREATE TABLE IF NOT EXISTS card_interactions (id INTEGER PRIMARY KEY AUTOINCREMENT, idea_id INTEGER NOT NULL, idea_version INTEGER NOT NULL, action TEXT NOT NULL, label TEXT NOT NULL DEFAULT '', active_ms INTEGER NOT NULL DEFAULT 0, wall_ms INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("CREATE UNIQUE INDEX IF NOT EXISTS idx_ideas_dedupe_key ON ideas(dedupe_key)"),
    db.prepare("CREATE INDEX IF NOT EXISTS idx_ideas_status_score ON ideas(status, score DESC)"),
    db.prepare("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, label TEXT NOT NULL, position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
    db.prepare("INSERT OR IGNORE INTO projects (id, label, position) VALUES (?, 'Default', 0)").bind(DEFAULT_PROJECT_ID),
    db.prepare(`CREATE TABLE IF NOT EXISTS topics (${TOPICS_COLUMNS})`),
  ]);
  const columns = await db.prepare("PRAGMA table_info(ideas)").all<{ name: string }>();
  const names = new Set(columns.results.map((column: { name: string }) => column.name));
  if (!names.has("project")) {
    await db.prepare("ALTER TABLE ideas ADD COLUMN project TEXT NOT NULL DEFAULT ''").run();
  }
  if (!names.has("project_id")) {
    await db.prepare(`ALTER TABLE ideas ADD COLUMN project_id TEXT NOT NULL DEFAULT '${DEFAULT_PROJECT_ID}'`).run();
  }
  if (!names.has("category")) {
    await db.prepare("ALTER TABLE ideas ADD COLUMN category TEXT NOT NULL DEFAULT ''").run();
  }
  if (!names.has("secondary_action")) {
    await db.prepare("ALTER TABLE ideas ADD COLUMN secondary_action TEXT NOT NULL DEFAULT 'See proof'").run();
  }
  if (!names.has("card_html")) {
    await db.prepare("ALTER TABLE ideas ADD COLUMN card_html TEXT NOT NULL DEFAULT ''").run();
  }
  if (!names.has("agent_context")) {
    await db.prepare("ALTER TABLE ideas ADD COLUMN agent_context TEXT NOT NULL DEFAULT '{}'").run();
  }
  if (!names.has("version")) {
    await db.prepare("ALTER TABLE ideas ADD COLUMN version INTEGER NOT NULL DEFAULT 1").run();
  }
  if (!names.has("decision_estimate_ms")) {
    await db.prepare("ALTER TABLE ideas ADD COLUMN decision_estimate_ms INTEGER NOT NULL DEFAULT 0").run();
  }
  if (!names.has("decision_estimate_reason")) {
    await db.prepare("ALTER TABLE ideas ADD COLUMN decision_estimate_reason TEXT NOT NULL DEFAULT ''").run();
  }
  const riseColumns = [
    ["rise_reach", "ALTER TABLE ideas ADD COLUMN rise_reach INTEGER NOT NULL DEFAULT 0"],
    ["rise_impact", "ALTER TABLE ideas ADD COLUMN rise_impact INTEGER NOT NULL DEFAULT 0"],
    ["rise_strategic_fit", "ALTER TABLE ideas ADD COLUMN rise_strategic_fit INTEGER NOT NULL DEFAULT 0"],
    ["rise_ease", "ALTER TABLE ideas ADD COLUMN rise_ease INTEGER NOT NULL DEFAULT 0"],
  ] as const;
  let addedRiseColumns = false;
  for (const [name, statement] of riseColumns) {
    if (names.has(name)) continue;
    await db.prepare(statement).run();
    addedRiseColumns = true;
  }
  if (addedRiseColumns) {
    await db.prepare(`
      UPDATE ideas SET
        rise_reach = CAST(score / 4 AS INTEGER) + CASE WHEN score % 4 >= 1 THEN 1 ELSE 0 END,
        rise_impact = CAST(score / 4 AS INTEGER) + CASE WHEN score % 4 >= 2 THEN 1 ELSE 0 END,
        rise_strategic_fit = CAST(score / 4 AS INTEGER) + CASE WHEN score % 4 >= 3 THEN 1 ELSE 0 END,
        rise_ease = CAST(score / 4 AS INTEGER)
    `).run();
  }
  const contextColumns = await db.prepare("PRAGMA table_info(contexts)").all<{ name: string }>();
  if (!contextColumns.results.some((column: { name: string }) => column.name === "project_id")) {
    await db.prepare(`ALTER TABLE contexts ADD COLUMN project_id TEXT NOT NULL DEFAULT '${DEFAULT_PROJECT_ID}'`).run();
  }
  // Topics were global with `id` as the key. Each project now has its own list,
  // so rebuild the table once with (project_id, id) and file old topics under Default.
  const topicColumns = await db.prepare("PRAGMA table_info(topics)").all<{ name: string }>();
  if (!topicColumns.results.some((column: { name: string }) => column.name === "project_id")) {
    await db.batch([
      db.prepare("DROP TABLE IF EXISTS topics_by_project"),
      db.prepare(`CREATE TABLE topics_by_project (${TOPICS_COLUMNS})`),
      db.prepare("INSERT INTO topics_by_project (project_id, id, label, hint, position, created_at) SELECT ?, id, label, hint, position, created_at FROM topics").bind(DEFAULT_PROJECT_ID),
      db.prepare("DROP TABLE topics"),
      db.prepare("ALTER TABLE topics_by_project RENAME TO topics"),
    ]);
  }
  const attentionColumns = await db.prepare("PRAGMA table_info(card_attention)").all<{ name: string }>();
  const attentionNames = new Set(attentionColumns.results.map((column: { name: string }) => column.name));
  if (!attentionNames.has("decision_source")) {
    await db.prepare("ALTER TABLE card_attention ADD COLUMN decision_source TEXT NOT NULL DEFAULT 'user'").run();
  }
  const jobColumns = await db.prepare("PRAGMA table_info(agent_jobs)").all<{ name: string }>();
  const jobNames = new Set(jobColumns.results.map((column: { name: string }) => column.name));
  if (!jobNames.has("ticket_outcome")) {
    await db.prepare("ALTER TABLE agent_jobs ADD COLUMN ticket_outcome TEXT").run();
  }
  // A replacement card can set an idea back to New before the agent posts its
  // terminal outcome. Reconcile from the latest explicit marker so completed,
  // review, and blocked remain card states instead of agent-run states. Never
  // revive a card the user already dismissed.
  await db.prepare(`
    UPDATE ideas
    SET status = CASE (
      SELECT latest.ticket_outcome
      FROM agent_jobs latest
      WHERE latest.idea_id = ideas.id
      ORDER BY latest.id DESC
      LIMIT 1
    )
      WHEN 'completed' THEN 'done'
      WHEN 'review' THEN 'new'
      WHEN 'blocked' THEN 'new'
      ELSE status
    END
    WHERE status IN ('new', 'working', 'done')
      AND (
        SELECT latest.ticket_outcome
        FROM agent_jobs latest
        WHERE latest.idea_id = ideas.id
        ORDER BY latest.id DESC
        LIMIT 1
      ) IS NOT NULL
  `).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_agent_jobs_status_created ON agent_jobs(status, created_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_card_attention_decided ON card_attention(decided_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_card_interactions_card ON card_interactions(idea_id, idea_version, id)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_ideas_project_status_score ON ideas(project_id, status, score DESC)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_contexts_project ON contexts(project_id, id)").run();
  await db.prepare("PRAGMA optimize").run();
}

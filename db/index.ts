import { env } from "cloudflare:workers";
import { JOB_MATCHES_IDEA_SQL } from "../lib/job-lifecycle";

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
    db.prepare("CREATE TABLE IF NOT EXISTS topics (id TEXT PRIMARY KEY, label TEXT NOT NULL, hint TEXT NOT NULL DEFAULT '', keywords TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"),
  ]);
  // Seed the four original topics once; after that the user and agents own the list.
  await db.prepare(`
    INSERT OR IGNORE INTO topics (id, label, hint, keywords, position) VALUES
      ('growth', 'Growth', 'posts, replies, outreach, integrations', 'growth,distribution,x reply,x post,reddit,quote,social,case study,demo,launch,hackathon,integration,hype,press,newsletter,community,mention,linkedin,hn,show hn,awesome,template,default', 1),
      ('support', 'Support', 'customer and ticket replies', 'support,pylon,customer,refund,billing,churn,outreach,onboarding,ticket,priority customer,named customer,customer support,support ops', 2),
      ('fix', 'Fixes', 'PRs, bugs, reliability, speed', 'fix,fixes,bug,reliab,reliability,regression,merge,pr,pull request,observab,logging,alert,installer,docker,restart,performance,startup,handoff,security,oss,contributor,conflict,blocked', 3),
      ('product', 'Product', 'features, decisions, stats, Agency', 'product,pitch,feature,decision,stats,agency,pricing,roadmap,analytics,usage,scaling user,what to build,design', 4)
  `).run();
  const columns = await db.prepare("PRAGMA table_info(ideas)").all<{ name: string }>();
  const names = new Set(columns.results.map((column: { name: string }) => column.name));
  if (!names.has("project")) {
    await db.prepare("ALTER TABLE ideas ADD COLUMN project TEXT NOT NULL DEFAULT 'Browser Use'").run();
  }
  if (!names.has("category")) {
    await db.prepare("ALTER TABLE ideas ADD COLUMN category TEXT NOT NULL DEFAULT 'Distribution'").run();
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
  // Only the latest terminal job for this card version may reconcile its state.
  // A fresh reply must not inherit completion from an older card version.
  await db.prepare(`
    UPDATE ideas
    SET status = CASE job.ticket_outcome
      WHEN 'completed' THEN 'done'
      WHEN 'review' THEN 'new'
      WHEN 'blocked' THEN 'new'
      ELSE ideas.status
    END
    FROM agent_jobs job
    WHERE job.idea_id = ideas.id
      AND job.id = (SELECT MAX(latest.id) FROM agent_jobs latest WHERE latest.idea_id = ideas.id)
      AND ideas.status IN ('new', 'working', 'done')
      AND job.action <> 'no'
      AND (
        (job.status = 'done' AND job.ticket_outcome IN ('completed', 'review'))
        OR (job.status = 'failed' AND job.ticket_outcome = 'blocked')
      )
      AND (${JOB_MATCHES_IDEA_SQL})
  `).run();
  // Early Agency audits used the same decision fields as real user clicks. Mark
  // those known maintenance labels once so decision timing measures the user.
  await db.prepare(`
    UPDATE card_attention SET decision_source = 'agency'
    WHERE decision_source = 'user' AND (
      decision_label LIKE 'Agency %'
      OR decision_label IN (
        'Evidence gap',
        'Archive merged PR result',
        'Refresh stale merge card',
        'Rejected by independent path audit',
        'Reject unsafe merge recommendation',
        'Reject regression-prone merge recommendation',
        'Reject partial token-accounting fix'
      )
    )
  `).run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_agent_jobs_status_created ON agent_jobs(status, created_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_card_attention_decided ON card_attention(decided_at)").run();
  await db.prepare("CREATE INDEX IF NOT EXISTS idx_card_interactions_card ON card_interactions(idea_id, idea_version, id)").run();
  await db.prepare("PRAGMA optimize").run();
}

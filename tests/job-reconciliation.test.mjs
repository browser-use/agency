import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { pathToFileURL } from "node:url";

const source = (variable, relative) => process.env[variable]
  ? pathToFileURL(process.env[variable]) : new URL(relative, import.meta.url);
const { JOB_MATCHES_IDEA_SQL } = await import(source("AGENCY_LIFECYCLE_SOURCE", "../lib/job-lifecycle.ts"));
const databaseSource = readFileSync(source("AGENCY_DB_SOURCE", "../db/index.ts"), "utf8");
const jobsSource = readFileSync(source("AGENCY_JOBS_SOURCE", "../app/api/agent-jobs/route.ts"), "utf8");
const tasksSource = readFileSync(source("AGENCY_TASKS_SOURCE", "../app/api/tasks/route.ts"), "utf8");
const expand = (sql) => sql.replaceAll("${JOB_MATCHES_IDEA_SQL}", JOB_MATCHES_IDEA_SQL);
const reconcileSql = expand(databaseSource.match(/await db\.prepare\(`\s*(UPDATE ideas\n[\s\S]*?)`\)\.run\(\);/)[1]);
const finishJobSql = jobsSource.match(/db\.prepare\("(UPDATE agent_jobs SET status = [^"]+)"\)/)[1];
const finishIdeaSql = expand(jobsSource.match(/updates\.push\(db\.prepare\(`([\s\S]*?)`\)/)[1]);
const T0 = "2026-09-05 10:00:00";
const T1 = "2026-09-05 10:00:01";
const T2 = "2026-09-05 10:00:02";

function fixture(idea = {}, jobs = [{}]) {
  const db = new DatabaseSync(":memory:");
  db.function("current_timestamp", () => T2);
  db.exec(`
    CREATE TABLE ideas(id INTEGER PRIMARY KEY, version INTEGER, status TEXT, created_at TEXT, score INTEGER, rise_impact INTEGER);
    CREATE TABLE agent_jobs(id INTEGER PRIMARY KEY, idea_id INTEGER, action TEXT, status TEXT, ticket_outcome TEXT, card_context TEXT, created_at TEXT, updated_at TEXT, result TEXT);
    CREATE TABLE feedback(id INTEGER PRIMARY KEY, note TEXT);
    CREATE TABLE card_attention(idea_id INTEGER, idea_version INTEGER, active_ms INTEGER);
    CREATE TABLE card_interactions(id INTEGER PRIMARY KEY, action TEXT);
    INSERT INTO feedback VALUES(1, 'Synthetic earlier feedback');
    INSERT INTO card_attention VALUES(1, 2, 12345);
    INSERT INTO card_interactions VALUES(1, 'do');
  `);
  const card = { id: 1, version: 2, status: "new", createdAt: T0, score: 72, riseImpact: 17, ...idea };
  db.prepare("INSERT INTO ideas VALUES (?, ?, ?, ?, ?, ?)").run(card.id, card.version, card.status, card.createdAt, card.score, card.riseImpact);
  for (const override of jobs) {
    const job = { id: 10, ideaId: card.id, action: "do", status: "done", outcome: "completed", context: JSON.stringify({ idea: { id: card.id, version: 2 } }), createdAt: T1, updatedAt: T2, result: "Earlier verified result", ...override };
    db.prepare("INSERT INTO agent_jobs VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(job.id, job.ideaId, job.action, job.status, job.outcome, job.context, job.createdAt, job.updatedAt, job.result);
  }
  return db;
}

const rows = (db, table) => db.prepare(`SELECT * FROM ${table} ORDER BY 1`).all().map((row) => ({ ...row }));
const cardStatus = (db) => db.prepare("SELECT status FROM ideas").get().status;
const history = (db) => ["agent_jobs", "feedback", "card_attention", "card_interactions"].map((table) => rows(db, table));
const cardData = (db) => rows(db, "ideas").map((row) => {
  delete row.status;
  return row;
});

function reconcile(db, expected) {
  const beforeHistory = history(db);
  const beforeCards = cardData(db);
  db.exec(reconcileSql);
  assert.equal(cardStatus(db), expected);
  assert.deepEqual(history(db), beforeHistory);
  assert.deepEqual(cardData(db), beforeCards);
  db.exec(reconcileSql);
  assert.equal(cardStatus(db), expected, "maintenance must be idempotent");
}

for (const [name, idea, jobs, expected] of [
  ["current completion", {}, [{}], "done"],
  ["current working completion", { status: "working" }, [{}], "done"],
  ["newer replacement after completion", { version: 3, createdAt: T2 }, [{}], "new"],
  ["same-second newer replacement", { version: 3, createdAt: T1 }, [{ updatedAt: T1 }], "new"],
  ["old job completes after replacement", { version: 3, createdAt: T1 }, [{ updatedAt: T2 }], "new"],
  ["captured version is authoritative over clocks", { createdAt: T2 }, [{ createdAt: T0, updatedAt: T0 }], "done"],
  ["current review", { status: "done" }, [{ outcome: "review" }], "new"],
  ["current blocked", { status: "working" }, [{ status: "failed", outcome: "blocked" }], "new"],
  ["stale review cannot reopen newer completed version", { version: 3, status: "done" }, [{ outcome: "review" }], "done"],
  ["stale blocked cannot reopen newer completed version", { version: 3, status: "done" }, [{ status: "failed", outcome: "blocked" }], "done"],
  ["Skip stays rejected", { status: "rejected" }, [{}], "rejected"],
  ["old Skip job is not an execution outcome", {}, [{ action: "no" }], "new"],
  ["newer queued job wins", { status: "working" }, [{}, { id: 11, status: "queued", outcome: null }], "working"],
  ["newer running job wins", { status: "working" }, [{}, { id: 11, status: "running", outcome: null }], "working"],
  ["in-flight marker cannot complete a card", { status: "working" }, [{ status: "running" }], "working"],
  ["invalid terminal combination ignored", { status: "working" }, [{ status: "failed", outcome: "completed" }], "working"],
  ["legacy first revision same-second completion", { version: 1 }, [{ context: "{}", createdAt: T0, updatedAt: T0 }], "done"],
  ["legacy job unambiguously created for current revision", {}, [{ context: "{}", createdAt: T1 }], "done"],
  ["legacy job predates replacement even if it finishes later", { version: 3, createdAt: T1 }, [{ context: "{}", createdAt: T0, updatedAt: T2 }], "new"],
  ["legacy same-second replacement is ambiguous", { version: 3, createdAt: T1 }, [{ context: "{}", createdAt: T1, updatedAt: T2 }], "new"],
  ["malformed historical context cannot abort maintenance", { version: 3, createdAt: T1 }, [{ context: "not JSON", createdAt: T0 }], "new"],
  ["explicit string version is not a legacy match", {}, [{ context: '{"idea":{"version":"2"}}' }], "new"],
  ["explicit null version is not a legacy match", {}, [{ context: '{"idea":{"version":null}}' }], "new"],
  ["legacy completed state without outcome preserved", { status: "done" }, [{ outcome: null }], "done"],
]) {
  test(name, () => {
    const db = fixture(idea, jobs);
    try { reconcile(db, expected); } finally { db.close(); }
  });
}

// Reproduce both requests having read status=running before either batch commits.
function finish(db, { id = 10, status = "done", outcome = "completed", expectedIdeaVersion = null } = {}) {
  db.exec("BEGIN");
  try {
    const job = db.prepare(finishJobSql).run(status, "Synthetic result", outcome, id, "running");
    const args = [outcome === "completed" ? "done" : "new", 1, 1, id, id, status, outcome, expectedIdeaVersion, expectedIdeaVersion];
    const idea = db.prepare(finishIdeaSql).run(...args.slice(0, (finishIdeaSql.match(/\?/g) ?? []).length));
    db.exec("COMMIT");
    return { jobChanges: job.changes, ideaChanges: idea.changes };
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

test("default completion never applies to a replacement, even in the same second", () => {
  const db = fixture({ version: 3, status: "new", createdAt: T2 }, [{ status: "running", outcome: null }]);
  try {
    assert.deepEqual(finish(db), { jobChanges: 1, ideaChanges: 0 });
    assert.equal(rows(db, "agent_jobs")[0].ticket_outcome, "completed");
    reconcile(db, "new");
  } finally { db.close(); }
});

test("explicit current replacement version can complete and later replacements stay New", () => {
  const db = fixture({ version: 3, createdAt: T2 }, [{ status: "running", outcome: null }]);
  try {
    assert.deepEqual(finish(db, { expectedIdeaVersion: 3 }), { jobChanges: 1, ideaChanges: 1 });
    reconcile(db, "done");
    db.prepare("UPDATE ideas SET version=4, status='new', created_at=?").run(T2);
    reconcile(db, "new");
  } finally { db.close(); }
});

test("explicit version cannot complete an intervening newer replacement", () => {
  const db = fixture({ version: 4, createdAt: T2 }, [{ status: "running", outcome: null }]);
  try {
    assert.deepEqual(finish(db, { expectedIdeaVersion: 3 }), { jobChanges: 1, ideaChanges: 0 });
    reconcile(db, "new");
  } finally { db.close(); }
});

for (const [first, second, expected] of [
  [{ status: "done", outcome: "completed" }, { status: "failed", outcome: "blocked" }, "done"],
  [{ status: "failed", outcome: "blocked" }, { status: "done", outcome: "completed" }, "new"],
  [{ status: "done", outcome: "review" }, { status: "done", outcome: "completed" }, "new"],
]) {
  test(`competing ${first.outcome}/${second.outcome} completions preserve the CAS winner`, () => {
    const db = fixture({ status: "working" }, [{ status: "running", outcome: null }]);
    try {
      assert.deepEqual(finish(db, first), { jobChanges: 1, ideaChanges: 1 });
      assert.deepEqual(finish(db, second), { jobChanges: 0, ideaChanges: 0 });
      assert.equal(rows(db, "agent_jobs")[0].ticket_outcome, first.outcome);
      reconcile(db, expected);
    } finally { db.close(); }
  });
}

test("a newer queued job prevents old completion applying even with an explicit version", () => {
  const db = fixture({ status: "working" }, [{ status: "running", outcome: null }, { id: 11, status: "queued", outcome: null }]);
  try {
    assert.deepEqual(finish(db, { expectedIdeaVersion: 2 }), { jobChanges: 1, ideaChanges: 0 });
    reconcile(db, "working");
  } finally { db.close(); }
});

test("same-outcome CAS loser cannot apply a different explicit card version", () => {
  const db = fixture({ version: 3, createdAt: T2 }, [{ status: "running", outcome: null }]);
  try {
    assert.deepEqual(finish(db, { expectedIdeaVersion: 2 }), { jobChanges: 1, ideaChanges: 0 });
    assert.deepEqual(finish(db, { expectedIdeaVersion: 3 }), { jobChanges: 0, ideaChanges: 0 });
    reconcile(db, "new");
  } finally { db.close(); }
});

test("Skip during an in-flight job survives completion", () => {
  const db = fixture({ status: "rejected" }, [{ status: "running", outcome: null }]);
  try {
    assert.deepEqual(finish(db), { jobChanges: 1, ideaChanges: 0 });
    reconcile(db, "rejected");
  } finally { db.close(); }
});

test("API validates explicit versions, reports lost CAS, and new task snapshots include version", () => {
  assert.match(jobsSource, /Number\.isInteger\(payload\.expectedIdeaVersion\)/);
  assert.match(jobsSource, /updatedJob\.meta\.changes !== 1[\s\S]*status: 409/);
  assert.match(jobsSource, /ideaStatus: updatedIdea\?\.meta\.changes \? ideaStatusForOutcome\(ticketOutcome\) : null/);
  assert.match(tasksSource, /RETURNING id, version, project/);
});

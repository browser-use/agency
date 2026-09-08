import { DatabaseSync } from "node:sqlite";
import { execFileSync } from "node:child_process";
import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  copyFileSync,
  statSync,
  renameSync,
} from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { createHash } from "node:crypto";

// Every network call goes through the authenticated Linear CLI. Never export auth tokens.
const configPath = resolve(process.argv[2] || ".linear-migration.json");
const cfg = JSON.parse(readFileSync(configPath, "utf8"));
const out = resolve(cfg.output);
mkdirSync(out, { recursive: true, mode: 0o700 });
function save(file, value) {
  const p = resolve(out, file);
  mkdirSync(dirname(p), { recursive: true, mode: 0o700 });
  writeFileSync(p + ".tmp", JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(p + ".tmp", p);
}
function load(file) {
  return JSON.parse(readFileSync(resolve(out, file), "utf8"));
}
function gql(value) {
  if (Array.isArray(value)) return `[${value.map(gql).join(",")}]`;
  if (value && typeof value === "object")
    return `{${Object.entries(value)
      .map(([k, v]) => `${k}:${gql(v)}`)
      .join(",")}}`;
  return JSON.stringify(value);
}
function api(query, variables = {}) {
  const result = execFileSync(
    "npx",
    [
      "--yes",
      "@schpet/linear-cli@2.6.0",
      "--workspace",
      cfg.workspace,
      "api",
      "--variables-json",
      JSON.stringify(variables),
    ],
    {
      input: query,
      encoding: "utf8",
      timeout: 60000,
      maxBuffer: 24 * 1024 * 1024,
      env: { ...process.env, LINEAR_IGNORE_ENV_FILE: "1", NO_COLOR: "1" },
    },
  );
  const parsed = JSON.parse(result);
  if (parsed.errors?.length) throw Error(JSON.stringify(parsed.errors));
  return parsed.data;
}
function identity() {
  const { viewer } = api("{viewer{id email organization{id}}}");
  if (viewer.id !== cfg.userId || viewer.organization.id !== cfg.organizationId)
    throw Error("Wrong Linear identity or workspace");
}
function idFor(kind, id) {
  const h = createHash("sha256")
    .update(`${cfg.organizationId}:agency:${cfg.sourceNamespace}:${kind}:${id}`)
    .digest("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
function redact(value) {
  if (typeof value === "string")
    return value
      .replace(
        /\b(?:lin_api_|bu_|ph[cpxst]_|gh[pousr]_|xox[baprs]-)[A-Za-z0-9_-]{12,}/g,
        "[REDACTED]",
      )
      .replace(/\b(?:sk|rk)[_-][A-Za-z0-9_-]{12,}/g, "[REDACTED]")
      .replace(/Bearer\s+[A-Za-z0-9._~-]{12,}/gi, "Bearer [REDACTED]")
      .replace(
        /([?&](?:token|key|secret|password|auth|signature|X-Amz-Signature)=)[^&\s"'<>]+/gi,
        "$1[REDACTED]",
      )
      .replace(/wss?:\/\/[^\s"'<>]+/g, "[REDACTED_BROWSER_CONNECTION]");
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [
        k,
        /^(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|password|secret)$/i.test(
          k,
        )
          ? "[REDACTED]"
          : redact(v),
      ]),
    );
  return value;
}
function plain(html) {
  return String(html ?? "")
    .replace(/<(style|script)\b[\s\S]*?<\/\1>/gi, "")
    .replace(
      /<\/(?:p|h[1-6]|li|div|section|summary|pre|details|article)>/gi,
      "\n\n",
    )
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_, n) =>
      String.fromCodePoint(
        Math.min(
          0x10ffff,
          n[0].toLowerCase() === "x" ? parseInt(n.slice(1), 16) : Number(n),
        ),
      ),
    )
    .replace(
      /&(?:amp|lt|gt|quot|apos|nbsp|#39);/g,
      (x) =>
        ({
          "&amp;": "&",
          "&lt;": "<",
          "&gt;": ">",
          "&quot;": '"',
          "&apos;": "'",
          "&#39;": "'",
          "&nbsp;": " ",
        })[x],
    )
    .replace(/\n\s*\n(?:\s*\n)+/g, "\n\n")
    .trim();
}
function lane(idea) {
  const text = idea.category.toLowerCase();
  if (/^(support|customer)/.test(text)) return "Support";
  if (/^(fix|oss|bug|reliab)/.test(text)) return "Fixes";
  if (/^(product|doc|feature|design)/.test(text)) return "Product";
  return "Growth";
}
function timestamp(v) {
  return v
    ? new Date(v.includes("T") ? v : v.replace(" ", "T") + "Z").toISOString()
    : null;
}
function description(record) {
  const { idea, feedback, jobs } = record;
  const history = [
    ...feedback.map((f) => ({
      at: f.created_at,
      text: `Feedback #${f.id} · ${f.decision}\n${f.note || "(button only)"}`,
    })),
    ...jobs.map((j) => ({
      at: j.updated_at,
      text: `Job #${j.id} · ${j.button_label} · ${j.status}${j.ticket_outcome ? " / " + j.ticket_outcome : ""}\n${j.user_feedback || ""}\n${j.result || "(No completion result recorded.)"}`,
    })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const visible =
    plain(idea.card_html) ||
    [idea.why_matters, idea.impact, idea.finished_work]
      .filter(Boolean)
      .join("\n\n");
  const parts = [
    `Imported Agency ticket #${idea.id} · revision ${idea.version}.`,
    `Source status: ${idea.status}. Importing this history does not execute any approval.`,
    idea.status === "done" &&
    !jobs.some((j) => j.status === "done" && j.ticket_outcome === "completed")
      ? "Historical Done status; completion was not independently verified by this migration."
      : "",
    `Original source: ${idea.source_url || "Local Agency"}`,
    `Local card: http://localhost:3117/?card=${idea.id} (this computer only).`,
    visible,
    `+++ [Earlier feedback and results (${history.length})]\n\n${history.map((h) => `### ${h.at}\n\n${h.text}`).join("\n\n")}\n\n+++`,
    `+++ [Agency source identity]\n\nSource key: ${idea.dedupe_key}\nSource ID: ${idea.id}\nVersion: ${idea.version}\nStored RISE: ${idea.score}/100\nHuman review estimate was ${idea.decision_estimate_ms} ms; this is historical metadata, not Linear points.\nFull machine-readable record and assets are preserved in the migration archive.\n\n+++`,
    `[agency-source:${cfg.sourceNamespace}:${idea.id}]`,
  ];
  // Long source history remains lossless in the private archive, not silently discarded.
  const full = parts.filter(Boolean).join("\n\n");
  if (full.length <= 85000) return full;
  return [
    parts[0],
    parts[1],
    parts[2],
    parts[3],
    parts[4],
    visible.slice(0, 55000),
    "Long diff/history continues in the attached private Agency archive.",
    parts.at(-2),
    parts.at(-1),
  ]
    .filter(Boolean)
    .join("\n\n");
}
const mode = process.argv[3];
if (mode === "export") {
  const db = new DatabaseSync(cfg.database, { readOnly: true });
  db.exec("BEGIN");
  const excluded = new Set(cfg.excludeIdeas || []);
  for (const id of cfg.excludeJobs || []) {
    const r = db.prepare("SELECT idea_id FROM agent_jobs WHERE id=?").get(id);
    if (r) excluded.add(r.idea_id);
  }
  for (const id of cfg.excludeFeedback || []) {
    const r = db.prepare("SELECT idea_id FROM feedback WHERE id=?").get(id);
    if (r) excluded.add(r.idea_id);
  }
  const allowed = `id NOT IN (${[...excluded].map(() => "?").join(",") || "NULL"})`;
  const ideas = excluded.size
    ? db
        .prepare(`SELECT * FROM ideas WHERE ${allowed} ORDER BY id`)
        .all(...excluded)
    : db.prepare("SELECT * FROM ideas ORDER BY id").all();
  const rows = [];
  const assets = new Set();
  const missing = [];
  function scan(html) {
    for (const m of String(html).matchAll(
      /\b(?:src|poster)=["'](\/[^"']+)["']/g,
    )) {
      const raw = m[1].split(/[?#]/)[0];
      if (
        /^\/(agent-assets|assets|media|previews|screenshots|videos)\//.test(raw)
      )
        assets.add(raw);
    }
  }
  for (const original of ideas) {
    const id = original.id;
    const record = redact({
      idea: original,
      feedback: db
        .prepare("SELECT * FROM feedback WHERE idea_id=? ORDER BY id")
        .all(id),
      jobs: db
        .prepare("SELECT * FROM agent_jobs WHERE idea_id=? ORDER BY id")
        .all(id),
      attention: db
        .prepare("SELECT * FROM card_attention WHERE idea_id=?")
        .all(id),
      interactions: db
        .prepare("SELECT * FROM card_interactions WHERE idea_id=? ORDER BY id")
        .all(id),
    });
    scan(record.idea.card_html);
    for (const j of record.jobs) {
      try {
        const c = JSON.parse(j.card_context);
        scan(c.idea?.cardHtml ?? c.idea?.card_html ?? "");
      } catch {}
    }
    save(`records/${id}.json`, record);
    const htmlPath = resolve(out, `html/${id}.html`);
    mkdirSync(dirname(htmlPath), { recursive: true });
    writeFileSync(htmlPath, record.idea.card_html, { mode: 0o600 });
    rows.push({
      sourceId: id,
      issueId: idFor("issue", original.dedupe_key),
      title: original.headline,
      lane: lane(original),
      status: original.status,
      version: original.version,
      createdAt: timestamp(original.created_at),
      sha256: createHash("sha256").update(JSON.stringify(record)).digest("hex"),
    });
  }
  const topics = db
    .prepare("SELECT id,label,hint,position FROM topics ORDER BY position")
    .all();
  db.exec("COMMIT");
  db.close();
  let bytes = 0;
  for (const p of assets) {
    const from = resolve(cfg.publicDir, "." + decodeURIComponent(p));
    if (relative(resolve(cfg.publicDir), from).startsWith(".."))
      throw Error("Asset escapes public directory");
    if (!existsSync(from)) {
      missing.push(p);
      continue;
    }
    const to = resolve(out, "public", "." + p);
    mkdirSync(dirname(to), { recursive: true });
    copyFileSync(from, to);
    bytes += statSync(to).size;
  }
  save("manifest.json", {
    format: "agency-linear-migration-v1",
    snapshotAt: new Date().toISOString(),
    sourceNamespace: cfg.sourceNamespace,
    projectId: cfg.projectId,
    organizationId: cfg.organizationId,
    rows,
    topics,
    assets: [...assets],
    missingAssets: missing,
    assetBytes: bytes,
  });
  console.log(
    JSON.stringify({
      tickets: rows.length,
      assets: assets.size,
      assetBytes: bytes,
      missingAssets: missing.length,
    }),
  );
} else if (mode === "import") {
  identity();
  const manifest = load("manifest.json");
  const state = existsSync(resolve(out, "import-state.json"))
    ? load("import-state.json")
    : { issues: {} };
  const max = Number(process.argv[4] || manifest.rows.length);
  const ordered = [...manifest.rows].sort(
    (a, b) =>
      ({ new: 0, working: 1, later: 2, done: 3, rejected: 4 })[a.status] -
        { new: 0, working: 1, later: 2, done: 3, rejected: 4 }[b.status] ||
      b.sourceId - a.sourceId,
  );
  let done = 0;
  for (let offset = 0; offset < Math.min(ordered.length, max); offset += 10) {
    const batch = ordered.slice(offset, Math.min(offset + 10, max));
    const existing = api(
      "query($ids:[ID!]){issues(filter:{id:{in:$ids}},first:50,includeArchived:true){nodes{id identifier url project{id} assignee{id} state{id}}}}",
      { ids: batch.map((x) => x.issueId) },
    ).issues.nodes;
    const missing = batch.filter(
      (r) => !existing.some((i) => i.id === r.issueId),
    );
    if (missing.length) {
      const variables = {};
      const definitions = [];
      const fields = [];
      missing.forEach((r, i) => {
        const record = load(`records/${r.sourceId}.json`);
        variables[`v${i}`] = {
          id: r.issueId,
          teamId: cfg.teamId,
          projectId: cfg.projectId,
          assigneeId: cfg.userId,
          title: record.idea.headline.slice(0, 250),
          description: description(record),
          stateId: cfg.states[r.status],
          labelIds: [cfg.labels[r.lane]],
          useDefaultTemplate: false,
          createdAt: r.createdAt,
        };
        definitions.push(`$v${i}:IssueCreateInput!`);
        fields.push(
          `i${i}:issueCreate(input:$v${i}){success issue{id identifier url project{id} assignee{id} state{id}}}`,
        );
      });
      // Persist intent before network. IDs are deterministic, so uncertain writes are reconciled.
      save(
        "pending-batch.json",
        missing.map((r) => ({ sourceId: r.sourceId, issueId: r.issueId })),
      );
      const inline = fields.map((field, i) =>
        field.replace(`input:$v${i}`, `input:${gql(variables[`v${i}`])}`),
      );
      const result = api(`mutation{${inline.join("\n")}}`);
      for (const value of Object.values(result)) {
        if (!value?.success)
          throw Error("Issue creation failed; reconcile before continuing");
        existing.push(value.issue);
      }
    }
    for (const row of batch) {
      const i = existing.find((x) => x.id === row.issueId);
      if (
        !i ||
        i.project?.id !== cfg.projectId ||
        i.assignee?.id !== cfg.userId
      )
        throw Error("Imported issue identity/assignment mismatch");
      state.issues[row.sourceId] = { ...i, sourceId: row.sourceId };
    }
    save("import-state.json", state);
    done += batch.length;
    console.log(
      `Verified ${done}/${Math.min(ordered.length, max)} imports (${Object.keys(state.issues).length} recorded).`,
    );
  }
} else if (mode === "verify") {
  identity();
  const manifest = load("manifest.json");
  const all = [];
  let after = null;
  do {
    const page = api(
      "query($project:ID!,$after:String){issues(filter:{project:{id:{eq:$project}}},first:100,after:$after,includeArchived:true){nodes{id identifier title url estimate assignee{id name} state{id name type} labels{nodes{id name}} updatedAt}pageInfo{hasNextPage endCursor}}}",
      { project: cfg.projectId, after },
    ).issues;
    all.push(...page.nodes);
    after = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (after);
  const expected = new Set(manifest.rows.map((x) => x.issueId));
  const missing = manifest.rows.filter(
    (x) => !all.some((i) => i.id === x.issueId),
  );
  const extra = all.filter((i) => !expected.has(i.id));
  const wrongOwner = all.filter((i) => i.assignee?.id !== cfg.userId);
  save("verified-linear.json", {
    verifiedAt: new Date().toISOString(),
    issues: all,
  });
  console.log(
    JSON.stringify({
      expected: expected.size,
      actual: all.length,
      missing: missing.length,
      extra: extra.length,
      wrongOwner: wrongOwner.length,
    }),
  );
  if (missing.length || extra.length || wrongOwner.length) process.exitCode = 1;
} else throw Error("Use export, import [limit], or verify");

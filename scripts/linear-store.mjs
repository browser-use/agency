import { createHash, randomUUID } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import {
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  mkdirSync,
  readdirSync,
} from "node:fs";
import { resolve, dirname } from "node:path";

export const fields =
  "id identifier title description url estimate updatedAt project{id} assignee{id name} state{id name type} labels{nodes{id name}}";
export const hash = (value) =>
  createHash("sha256")
    .update(typeof value === "string" ? value : JSON.stringify(value))
    .digest("hex");
export function uuid(value) {
  const h = hash(value);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
export function fail(status, message) {
  throw Object.assign(Error(message), { status });
}
const camel = (row) =>
  Object.fromEntries(
    Object.entries(row).map(([k, v]) => [
      k.replace(/_([a-z])/g, (_, c) => c.toUpperCase()),
      v,
    ]),
  );
const escape = (text) =>
  String(text ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const median = (values) => {
  const a = values
    .filter((x) => x !== null && Number.isFinite(x) && x >= 0)
    .sort((a, b) => a - b);
  return a.length
    ? a.length % 2
      ? a[a.length >> 1]
      : Math.round((a[a.length / 2 - 1] + a[a.length / 2]) / 2)
    : null;
};
const date = (value) =>
  Date.parse(value?.includes("T") ? value : `${value?.replace(" ", "T")}Z`);
const points = (idea) =>
  Math.max(0, Math.min(10, Math.round(Number(idea.rise_impact ?? 0) / 2.5)));
const allocate = () => parseInt(hash(randomUUID()).slice(0, 12), 16);
export function safeShared(value) {
  const s = JSON.stringify(value);
  if (
    /\b(?:lin_api_|gh[pousr]_|xox[baprs]-|sk[-_]|rk[-_])[A-Za-z0-9_-]{16,}|\b[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}:[0-9a-f]{28,}\b|(?:postgres(?:ql)?|mysql):\/\/[^\s]+:[^\s]+@|Bearer\s+[A-Za-z0-9._~-]{20,}/i.test(
      s,
    )
  )
    fail(
      400,
      "Possible credential in shared content. Remove it before saving to Linear.",
    );
  return value;
}
function nativeCard(issue) {
  return `<style>:host{display:block}article{padding:32px;font:16px/1.5 system-ui}h1{font-size:34px;line-height:1.1}pre{white-space:pre-wrap;font:inherit}</style><article><small>${escape(issue.identifier)}</small><h1>${escape(issue.title)}</h1><pre>${escape(issue.description || "Added in Linear. Agency can prepare the finished work here.")}</pre></article>`;
}

export function encodeEvent(event, id) {
  const data = gzipSync(
    Buffer.from(JSON.stringify(safeShared(event))),
  ).toString("base64");
  const chunks = [];
  for (let n = 0; n < data.length; n += 40000)
    chunks.push({
      id: uuid(`${id}:chunk:${n}`),
      body: `Agency payload v1\n\n\`\`\`text\n${data.slice(n, n + 40000)}\n\`\`\``,
    });
  return {
    chunks,
    body: `${event.summary}\n\n+++ [Agency revision record]\n\nAgency event v1\n\`\`\`json\n${JSON.stringify({ id, chunks: chunks.map((c) => c.id), sha256: hash(data) })}\n\`\`\`\n\n+++`,
  };
}
export function decodeEvents(comments, allowedActors) {
  const byId = new Map(comments.map((c) => [c.id, c]));
  const events = [];
  for (const c of comments) {
    if (!allowedActors.includes(c.user?.id)) continue;
    const match = c.body?.match(/Agency event v1\n```json\n([^\n]+)\n```/);
    if (!match) continue;
    try {
      const meta = JSON.parse(match[1]);
      const data = meta.chunks
        .map((id) => {
          const part = byId.get(id);
          if (part?.user?.id !== c.user.id) throw Error("Actor mismatch");
          return part.body.match(/```text\n([A-Za-z0-9+/=]+)\n```/)[1];
        })
        .join("");
      if (hash(data) !== meta.sha256) throw Error("Hash mismatch");
      events.push({
        ...JSON.parse(
          gunzipSync(Buffer.from(data, "base64"), {
            maxOutputLength: 8 * 1024 * 1024,
          }).toString(),
        ),
        eventId: meta.id,
        committedAt: c.createdAt,
      });
    } catch {
      fail(
        502,
        "Incomplete or corrupt Agency history in Linear. Nothing was changed.",
      );
    }
  }
  return events.sort((a, b) => a.committedAt.localeCompare(b.committedAt));
}

export function createStore(cfg, api) {
  const root = resolve(cfg.output);
  const read = (p) => JSON.parse(readFileSync(resolve(root, p), "utf8"));
  const save = (p, value) => {
    const f = resolve(root, p);
    mkdirSync(dirname(f), { recursive: true, mode: 0o700 });
    writeFileSync(f + ".tmp", JSON.stringify(value, null, 2), { mode: 0o600 });
    renameSync(f + ".tmp", f);
  };
  const manifest = read("manifest.json");
  const records = new Map(
    readdirSync(resolve(root, "records"))
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const r = read(`records/${f}`);
        return [r.idea.id, r];
      }),
  );
  for (const r of records.values())
    for (const a of r.attention || []) {
      a.version ??= a.idea_version;
      a.first_viewed_at ??= a.first_seen_at;
    }
  const journal = existsSync(resolve(root, "bridge-journal.json"))
    ? read("bridge-journal.json")
    : { operations: {}, newJobs: [] };
  journal.applied ??= [];
  journal.sequence ??= 3000000;
  journal.native ??= {};
  const persist = () => save("bridge-journal.json", journal);
  const mapping = new Map([
    ...manifest.rows.map((r) => [r.issueId, r.sourceId]),
    ...Object.entries(journal.native),
  ]);
  let live = new Map(),
    syncedAt = null,
    syncError = "Initial sync pending",
    lastFull = 0,
    identityVerified = false;
  if (existsSync(resolve(root, "bridge-live.json"))) {
    const c = read("bridge-live.json");
    live = new Map(c.issues);
    syncedAt = c.syncedAt;
  }
  const topics = () => manifest.topics.map((t) => ({ ...t, keywords: [] }));
  function status(issue, fallback = "new") {
    return issue
      ? (Object.entries(cfg.states).find(
          ([, id]) => id === issue.state.id,
        )?.[0] ??
          ({
            completed: "done",
            canceled: "rejected",
            duplicate: "rejected",
            started: "working",
            backlog: "later",
            unstarted: "new",
          }[issue.state.type] ||
            "new"))
      : fallback;
  }
  const issueIdFor = (id) =>
    [...mapping].find(([, v]) => v === Number(id))?.[0];
  function apply(event, issueId) {
    if (journal.applied.includes(event.eventId)) return;
    if (event.record) {
      const r = event.record;
      const id = mapping.get(issueId) ?? r.idea.id;
      if (id !== r.idea.id) fail(409, "Agency source identity differs");
      mapping.set(issueId, id);
      journal.native[issueId] = id;
      records.set(id, r);
      save(`records/${id}.json`, r);
      for (const j of r.jobs ?? [])
        if (j.bridgeCreated && !journal.newJobs.includes(j.id))
          journal.newJobs.push(j.id);
    }
    journal.applied.push(event.eventId);
    persist();
  }
  async function history(id) {
    let after = null;
    const comments = [];
    do {
      const r = await api(
        "query($id:String!,$after:String){issue(id:$id){comments(first:100,after:$after){nodes{id body createdAt user{id}}pageInfo{hasNextPage endCursor}}}}",
        { id, after },
      );
      if (!r.issue) fail(404, "Linear issue no longer exists");
      comments.push(...r.issue.comments.nodes);
      after = r.issue.comments.pageInfo.hasNextPage
        ? r.issue.comments.pageInfo.endCursor
        : null;
      if (comments.length > 5000)
        fail(502, "Large issue history needs manual reconciliation");
    } while (after);
    return comments;
  }
  async function refreshRecord(issue) {
    const comments = await history(issue.id);
    for (const event of decodeEvents(comments, [
      cfg.userId,
      ...(cfg.agentActorIds || []),
    ]))
      apply(event, issue.id);
  }
  async function identity() {
    const { viewer } = await api("{viewer{id organization{id}}}");
    if (
      viewer.id !== cfg.userId ||
      viewer.organization.id !== cfg.organizationId
    )
      fail(
        403,
        "Wrong Linear user or workspace. Reauthenticate with the configured account.",
      );
    identityVerified = true;
  }
  async function fresh(id) {
    if (!identityVerified) await identity();
    const r = await api(
      `query($ids:[ID!]){issues(filter:{id:{in:$ids}},first:1,includeArchived:true){nodes{${fields}}}}`,
      { ids: [id] },
    );
    const issue = r.issues.nodes[0];
    if (!issue || issue.project?.id !== cfg.projectId)
      fail(409, "Ticket moved out of the Agency project or was removed");
    await refreshRecord(issue);
    live.set(mapping.get(id), issue);
    return issue;
  }
  async function sync(force = false) {
    try {
      await identity();
      const full = force || Date.now() - lastFull > 600000;
      const found = new Set();
      let after = null;
      const started = new Date().toISOString();
      do {
        const filter = {
          project: { id: { eq: cfg.projectId } },
          ...(!full && syncedAt
            ? {
                updatedAt: {
                  gte: new Date(date(syncedAt) - 2000).toISOString(),
                },
              }
            : {}),
        };
        const r = await api(
          `query($filter:IssueFilter!,$after:String){issues(filter:$filter,first:100,after:$after,includeArchived:true){nodes{${fields}}pageInfo{hasNextPage endCursor}}}`,
          { filter, after },
        );
        for (const issue of r.issues.nodes) {
          found.add(issue.id);
          let id = mapping.get(issue.id);
          const previous = id && live.get(id);
          if (
            !id ||
            (issue.updatedAt !== previous?.updatedAt &&
              date(issue.updatedAt) > date(manifest.snapshotAt))
          )
            await refreshRecord(issue);
          id = mapping.get(issue.id);
          if (!id) {
            id = parseInt(hash(issue.id).slice(0, 12), 16);
            mapping.set(issue.id, id);
            journal.native[issue.id] = id;
            const r = {
              idea: {
                id,
                version: 1,
                project: "Agency",
                category: "",
                headline: issue.title,
                card_html: nativeCard(issue),
                agent_context:
                  "Created in Linear. No external action approved.",
                dedupe_key: `linear:${issue.id}`,
                status: status(issue),
                score: 0,
                rise_impact: 0,
                created_at: issue.updatedAt,
              },
              jobs: [],
              feedback: [],
              attention: [],
              interactions: [],
            };
            records.set(id, r);
            save(`records/${id}.json`, r);
            persist();
          }
          live.set(id, issue);
        }
        after = r.issues.pageInfo.hasNextPage
          ? r.issues.pageInfo.endCursor
          : null;
      } while (after);
      if (full) {
        for (const [id, issue] of live)
          if (!found.has(issue.id)) live.delete(id);
        lastFull = Date.now();
      }
      syncedAt = started;
      syncError = "";
      save("bridge-live.json", { syncedAt, issues: [...live] });
    } catch (e) {
      syncError = e.message;
      throw e;
    }
  }
  function card(r, light = false) {
    const i = r.idea,
      l = live.get(i.id),
      j = r.jobs.at(-1),
      a = r.attention?.filter((a) => a.version === i.version).at(-1);
    return {
      ...camel(i),
      cardHtml: light ? "" : i.card_html,
      headline: l?.title ?? i.headline,
      status: status(l, i.status),
      category: (() => {
        const label = l?.labels.nodes.find((x) =>
          Object.values(cfg.labels).includes(x.id),
        )?.name;
        const original = manifest.rows.find((x) => x.sourceId === i.id)?.lane;
        return label && label !== original ? label : i.category;
      })(),
      linearId: l?.id ?? null,
      linearIdentifier: l?.identifier ?? null,
      linearUrl: l?.url ?? null,
      assigneeId: l?.assignee?.id ?? null,
      assigneeName: l?.assignee?.name ?? "Unassigned",
      linearEstimate: l?.estimate ?? null,
      jobId: j?.id ?? null,
      jobStatus: j?.status ?? null,
      jobOutcome: j?.ticket_outcome ?? null,
      jobResult: j?.result ?? null,
      jobLabel: j?.button_label ?? null,
      jobUpdatedAt: j?.updated_at ?? null,
      importedJobPaused:
        !!j && !j.bridgeCreated && ["queued", "running"].includes(j.status),
      decisionActiveMs: a?.active_ms ?? null,
      decisionWallMs: a?.wall_ms ?? null,
      decisionAction: a?.decision_action ?? null,
      decisionKind: i.decision_kind ?? "task",
    };
  }
  function state(url) {
    const owner = url.searchParams.get("owner"),
      view = url.searchParams.get("view") || "new",
      only = Number(url.searchParams.get("only")),
      selected = Number(url.searchParams.get("card"));
    const all = [...records.values()].filter((r) => live.has(r.idea.id));
    const scoped = all.filter(
      (r) => !owner || live.get(r.idea.id)?.assignee?.id === owner,
    );
    const done = scoped.filter((r) => status(live.get(r.idea.id)) === "done");
    const verified = done.filter(
      (r) => r.jobs.at(-1)?.ticket_outcome === "completed",
    );
    const today = new Date().toISOString().slice(0, 10);
    const vt = verified.filter(
      (r) => r.jobs.at(-1)?.updated_at?.slice(0, 10) === today,
    );
    const latest = all.map((r) => r.jobs.at(-1)).filter(Boolean);
    const decisions = scoped
      .flatMap((r) => r.attention || [])
      .filter(
        (a) =>
          a.decision_source !== "agency" &&
          a.decision_action &&
          date(a.decided_at) >= Date.now() - 48 * 3600000,
      );
    const context =
      cfg.mePath && existsSync(cfg.mePath)
        ? readFileSync(cfg.mePath, "utf8")
        : "";
    return {
      context: { text: context, createdAt: manifest.snapshotAt },
      topics: topics(),
      ideas: scoped
        .filter((r) =>
          only
            ? r.idea.id === only
            : status(live.get(r.idea.id)) === view || r.idea.id === selected,
        )
        .map((r) => card(r, url.searchParams.get("light") === "1" && !only)),
      laneCounts: Object.fromEntries(
        ["new", "working", "done"].map((s) => [
          s,
          scoped.filter(
            (r) => status(live.get(r.idea.id)) === s && r.idea.card_html,
          ).length,
        ]),
      ),
      jobs: {
        queued: latest.filter((j) => j.bridgeCreated && j.status === "queued")
          .length,
        running: latest.filter((j) => j.bridgeCreated && j.status === "running")
          .length,
      },
      completionStats: {
        verified: verified.length,
        legacy: done.length - verified.length,
        reviewReady: scoped.filter(
          (r) => r.jobs.at(-1)?.ticket_outcome === "review",
        ).length,
        dismissed: scoped.filter(
          (r) => status(live.get(r.idea.id)) === "rejected",
        ).length,
        points: verified.reduce((s, r) => s + points(r.idea), 0),
        pointsToday: vt.reduce((s, r) => s + points(r.idea), 0),
        verifiedToday: vt.length,
      },
      decisionMetrics: {
        tracked: decisions.length,
        accepted: decisions.filter((a) => a.decision_action === "do").length,
        changed: decisions.filter((a) => a.decision_action === "change").length,
        rejected: decisions.filter((a) => a.decision_action === "no").length,
        parked: decisions.filter((a) => a.wall_ms > 1800000).length,
        medianActiveMs: median(decisions.map((a) => a.active_ms)),
        medianAcceptedActiveMs: median(
          decisions
            .filter((a) => a.decision_action === "do")
            .map((a) => a.active_ms),
        ),
        medianFastWallMs: median(
          decisions.filter((a) => a.wall_ms <= 1800000).map((a) => a.wall_ms),
        ),
        medianFirstActionMs: median(decisions.map((a) => a.first_action_ms)),
        medianEstimateErrorMs: null,
      },
      linear: {
        projectUrl: cfg.projectUrl,
        members: cfg.members,
        syncedAt,
        syncError,
        imported: live.size,
        total: records.size,
        executionPaused: !cfg.enableWrites,
        importedPending: latest.filter(
          (j) => !j.bridgeCreated && ["queued", "running"].includes(j.status),
        ).length,
      },
    };
  }
  async function commentOnce(id, issueId, body) {
    // A failed read is not a missing comment. Deterministic IDs reconcile uncertain writes.
    const r = await api(
      "query($ids:[ID!]){comments(filter:{id:{in:$ids}},first:1){nodes{id body issue{id}}}}",
      { ids: [id] },
    );
    if (r.comments.nodes.length) {
      const existing = r.comments.nodes[0];
      if (existing.issue.id !== issueId || existing.body !== body)
        fail(409, "Saved event differs from this retry");
      return;
    }
    const result = await api(
      "mutation($input:CommentCreateInput!){commentCreate(input:$input){success}}",
      { input: { id, issueId, body } },
    );
    if (!result.commentCreate.success)
      fail(502, "Linear did not confirm history persistence");
  }
  async function update(id, input) {
    const r = await api(
      `mutation($id:String!,$input:IssueUpdateInput!){issueUpdate(id:$id,input:$input){success issue{${fields}}}}`,
      { id, input },
    );
    if (!r.issueUpdate.success) fail(502, "Linear did not confirm the update");
    live.set(mapping.get(id), r.issueUpdate.issue);
    return r.issueUpdate.issue;
  }
  async function commit(op) {
    if (op.completed) return op.result;
    const encoded = encodeEvent(op.event, op.id);
    for (const c of encoded.chunks) await commentOnce(c.id, op.issueId, c.body);
    // Save native state first, then publish the committed event. Incomplete work never enters the queue.
    if (op.input && Object.keys(op.input).length)
      await update(op.issueId, op.input);
    await commentOnce(op.id, op.issueId, encoded.body);
    apply({ ...op.event, eventId: op.id }, op.issueId);
    op.completed = true;
    persist();
    save("bridge-live.json", { syncedAt, issues: [...live] });
    return op.result;
  }
  function operation(key, build) {
    let op = journal.operations[key];
    if (!op) {
      op = { id: randomUUID(), ...build() };
      safeShared(op.event);
      journal.operations[key] = op;
      persist();
    }
    return op;
  }
  async function createIssue(op) {
    const found = await api(
      `query($ids:[ID!]){issues(filter:{id:{in:$ids}},first:1,includeArchived:true){nodes{${fields}}}}`,
      { ids: [op.issueId] },
    );
    let issue = found.issues.nodes[0];
    if (issue && issue.project?.id !== cfg.projectId)
      fail(409, "Existing identity belongs to another project");
    if (!issue) {
      const r = await api(
        `mutation($input:IssueCreateInput!){issueCreate(input:$input){success issue{${fields}}}}`,
        {
          input: {
            id: op.issueId,
            teamId: cfg.teamId,
            projectId: cfg.projectId,
            assigneeId: cfg.userId,
            useDefaultTemplate: false,
            ...op.create,
          },
        },
      );
      if (!r.issueCreate.success)
        fail(502, "Linear did not confirm the new ticket");
      issue = r.issueCreate.issue;
    }
    const sourceId = op.event.record.idea.id;
    mapping.set(op.issueId, sourceId);
    journal.native[op.issueId] = sourceId;
    live.set(sourceId, issue);
    persist();
  }
  function stats(url) {
    const days = Math.max(
        1,
        Math.min(365, Number(url.searchParams.get("days")) || 30),
      ),
      since = Date.now() - days * 86400000;
    const all = [...records.values()].filter((r) => live.has(r.idea.id));
    const cluster = (r) =>
      topics().find(
        (t) =>
          t.label.toLowerCase() ===
          card(r)
            .category.split(/[·:|/-]/)[0]
            .trim()
            .toLowerCase(),
      )?.id || "";
    const decisions = all.flatMap((r) =>
      (r.attention || [])
        .filter(
          (a) =>
            a.decision_source !== "agency" &&
            ["do", "change", "no"].includes(a.decision_action) &&
            date(a.decided_at) >= since,
        )
        .map((a) => ({ ...a, r, cluster: cluster(r) })),
    );
    const bucket = (rows) => ({
      do: rows.filter((a) => a.decision_action === "do").length,
      change: rows.filter((a) => a.decision_action === "change").length,
      no: rows.filter((a) => a.decision_action === "no").length,
      parked: rows.filter((a) => a.wall_ms > 1800000).length,
      likedPoints: 0,
      medianActiveMs: median(rows.map((a) => a.active_ms)),
      medianDoMs: median(
        rows.filter((a) => a.decision_action === "do").map((a) => a.active_ms),
      ),
      decided: rows.length,
      doRate: rows.length
        ? Math.round(
            (100 * rows.filter((a) => a.decision_action === "do").length) /
              rows.length,
          )
        : null,
    });
    const verified = all.filter(
      (r) =>
        status(live.get(r.idea.id)) === "done" &&
        r.jobs.at(-1)?.ticket_outcome === "completed",
    );
    const recentDone = verified.filter(
      (r) => date(r.jobs.at(-1)?.updated_at) >= since,
    );
    const donePoints = recentDone.reduce((s, r) => s + points(r.idea), 0);
    const series = new Map();
    const day = (d) => {
      if (!series.has(d))
        series.set(d, { day: d, do: 0, change: 0, no: 0, points: 0 });
      return series.get(d);
    };
    for (const a of decisions)
      day(a.decided_at.slice(0, 10))[a.decision_action]++;
    for (const r of recentDone)
      day(r.jobs.at(-1).updated_at.slice(0, 10)).points += points(r.idea);
    const names = [...new Set(decisions.map((a) => card(a.r).category))];
    return {
      days,
      total: { ...bucket(decisions), donePoints, points: donePoints },
      clusters: topics().map((t) => {
        const cards = all.filter((r) => cluster(r) === t.id);
        return {
          ...t,
          ...bucket(decisions.filter((a) => a.cluster === t.id)),
          open: cards.filter((r) =>
            ["new", "working", "later"].includes(status(live.get(r.idea.id))),
          ).length,
          done: cards.filter((r) => status(live.get(r.idea.id)) === "done")
            .length,
          rejected: cards.filter(
            (r) => status(live.get(r.idea.id)) === "rejected",
          ).length,
          donePoints: verified
            .filter((r) => cluster(r) === t.id)
            .reduce((s, r) => s + points(r.idea), 0),
        };
      }),
      categories: names
        .map((name) => ({
          name,
          ...bucket(decisions.filter((a) => card(a.r).category === name)),
        }))
        .filter((c) => c.decided >= 3)
        .sort((a, b) => b.doRate - a.doRate),
      days_series: [...series.values()].sort((a, b) =>
        a.day.localeCompare(b.day),
      ),
      recent: decisions
        .sort((a, b) => date(b.decided_at) - date(a.decided_at))
        .slice(0, 40)
        .map((a) => ({
          ideaId: a.r.idea.id,
          headline: card(a.r).headline,
          action: a.decision_action,
          activeMs: a.active_ms,
          decidedAt: a.decided_at,
          cluster: a.cluster,
        })),
    };
  }
  function attention(p) {
    const r = records.get(Number(p.id));
    if (!r || p.version !== r.idea.version) return { ok: true, tracked: false };
    r.attention ??= [];
    let a = r.attention.find((a) => a.version === p.version);
    const now = new Date().toISOString();
    if (!a) {
      a = {
        idea_id: r.idea.id,
        version: p.version,
        first_viewed_at: now,
        active_ms: 0,
        decision_action: null,
      };
      r.attention.push(a);
    }
    if (a.decision_action) return { ok: true, tracked: false };
    a.active_ms += Math.max(0, Math.min(15000, Number(p.activeMs) || 0));
    if (p.event === "interaction") {
      r.interactions ??= [];
      r.interactions.push({
        idea_id: r.idea.id,
        version: p.version,
        action: p.action,
        label: String(p.label || "").slice(0, 120),
        created_at: now,
      });
      a.first_action_ms ??= Math.max(0, Date.now() - date(a.first_viewed_at));
    }
    save(`records/${r.idea.id}.json`, r);
    return { ok: true, tracked: true };
  }
  async function mutate(path, p, method = "POST") {
    if (path === "/api/ideas/attention") return attention(p);
    if (!cfg.enableWrites)
      fail(503, "Migration verification is still running. No action queued.");
    if (!identityVerified) await identity();
    if (path === "/api/topics") {
      if (method === "DELETE") {
        if (!manifest.topics.some((t) => t.id === p.id))
          fail(404, "Topic not found");
        manifest.topics = manifest.topics.filter((t) => t.id !== p.id);
      } else {
        const label = String(p.label || "").trim(),
          hint = String(p.hint || "").trim();
        if (!label || label.length > 80 || hint.length > 500)
          fail(400, "Topic needs a short name and description");
        const found = manifest.topics.find((t) => t.id === p.id);
        if (found) Object.assign(found, { label, hint });
        else
          manifest.topics.push({
            id: randomUUID(),
            label,
            hint,
            position: manifest.topics.length,
          });
      }
      save("manifest.json", manifest);
      return { ok: true, topics: topics() };
    }
    if (path === "/api/tasks") {
      const task = String(p.task || "").trim();
      if (!task || task.length > 5000)
        fail(400, "Task must be 1–5000 characters");
      if (!p.requestId || !/^[\w-]{10,100}$/.test(p.requestId))
        fail(400, "A stable requestId is required");
      const key = hash(["task", cfg.userId, p.requestId]);
      const op = operation(key, () => {
        const id = allocate(),
          jobId = allocate(),
          issueId = uuid(
            `${cfg.organizationId}:${cfg.projectId}:task:${p.requestId}`,
          ),
          now = new Date().toISOString();
        const r = {
          idea: {
            id,
            version: 1,
            project: "Agency",
            category: "Product",
            headline: task.replace(/\s+/g, " ").slice(0, 180),
            card_html: nativeCard({
              title: task,
              identifier: "YOUR TASK",
              description:
                "Queued. Keep reviewing New cards while Agency works.",
            }),
            agent_context: JSON.stringify({
              kind: "user_task",
              task,
              boundary:
                "Do safe private work. This request is not blanket authority for external actions.",
            }),
            dedupe_key: `user-task:${p.requestId}`,
            status: "working",
            score: 0,
            rise_impact: 0,
            created_at: now,
          },
          feedback: [],
          attention: [],
          interactions: [],
          jobs: [],
        };
        r.jobs.push({
          id: jobId,
          idea_id: id,
          action: "task",
          button_label: "New task",
          instruction: task,
          user_feedback: "",
          card_context: JSON.stringify({
            idea: camel(r.idea),
            task: { request: task },
            actorId: cfg.userId,
            linearIssueId: issueId,
          }),
          status: "queued",
          ticket_outcome: null,
          result: "",
          created_at: now,
          updated_at: now,
          bridgeCreated: true,
        });
        return {
          issueId,
          create: {
            title: r.idea.headline,
            description: task,
            stateId: cfg.states.working,
            labelIds: cfg.labels.Product ? [cfg.labels.Product] : [],
          },
          event: { kind: "task", summary: `New task\n\n${task}`, record: r },
          result: { ok: true, ideaId: id, jobId },
        };
      });
      if (op.completed) return op.result;
      await createIssue(op);
      return commit(op);
    }
    if (path === "/api/ideas") {
      if (
        !p.dedupeKey ||
        !p.headline ||
        !p.project ||
        !p.category ||
        typeof p.cardHtml !== "string" ||
        p.cardHtml.length < 80 ||
        p.cardHtml.length > 250000
      )
        fail(
          400,
          "A card needs project, category, headline, dedupeKey and 80–250000 characters of HTML",
        );
      if (
        /<\s*(script|iframe|object|embed|form|meta|base|link|svg|math|a)\b|\son[a-z]+\s*=|javascript\s*:|@import\b|url\s*\(\s*["']?(?:https?:)?\/\/|\s(?:src|poster|srcset)\s*=\s*["'](?:https?:)?\/\//i.test(
          p.cardHtml,
        )
      )
        fail(400, "Unsafe card HTML");
      if (!/data-radar-(?:action|state)\s*=/.test(p.cardHtml))
        fail(400, "Card needs a finished action or explicit blocked state");
      const components = ["reach", "impact", "strategicFit", "ease"].map(
        (k) => p.rise?.[k],
      );
      if (!components.every((n) => Number.isFinite(n) && n >= 0 && n <= 25))
        fail(400, "RISE components must be 0–25");
      const previous = [...records.values()].find(
        (r) => r.idea.dedupe_key === p.dedupeKey,
      );
      const key = hash([
        "revision",
        p.dedupeKey,
        p.expectedVersion,
        p.cardHtml,
        p.headline,
        p.agentContext,
        p.rise,
      ]);
      const existing = journal.operations[key];
      if (existing?.completed) return existing.result;
      let current = previous,
        issueId = previous && issueIdFor(previous.idea.id);
      if (issueId) {
        await fresh(issueId);
        current = records.get(previous.idea.id);
        if (current.idea.version !== p.expectedVersion && !existing)
          fail(409, "expectedVersion must match the current card");
        if (["done", "rejected"].includes(status(live.get(current.idea.id))))
          fail(
            409,
            "Do not reopen completed or canceled tickets through ingestion",
          );
      }
      const op = operation(key, () => {
        const now = new Date().toISOString(),
          r = current
            ? structuredClone(current)
            : {
                idea: {
                  id: allocate(),
                  version: 0,
                  dedupe_key: p.dedupeKey,
                  created_at: now,
                },
                feedback: [],
                jobs: [],
                attention: [],
                interactions: [],
              };
        const target =
          issueId ||
          uuid(`${cfg.organizationId}:${cfg.projectId}:card:${p.dedupeKey}`);
        Object.assign(r.idea, {
          project: p.project,
          category: p.category,
          headline: String(p.headline).slice(0, 250),
          card_html: p.cardHtml,
          agent_context:
            typeof p.agentContext === "string"
              ? p.agentContext
              : JSON.stringify(p.agentContext || {}),
          score: components.reduce((a, b) => a + b, 0),
          rise_reach: components[0],
          rise_impact: components[1],
          rise_strategic_fit: components[2],
          rise_ease: components[3],
          source_label: p.sourceLabel || "",
          source_url: p.sourceUrl || "",
          agent_name: p.agentName || "Agency",
          version: r.idea.version + 1,
          status: current ? status(live.get(current.idea.id)) : "new",
        });
        const input = { title: r.idea.headline };
        const event = {
          kind: "revision",
          summary: `Agency card revision ${r.idea.version}\n\n${r.idea.headline}\n\nThe same ticket, with a new reviewable artifact. Previous approvals do not apply to changed actions.`,
          record: r,
        };
        return {
          issueId: target,
          input: current ? input : undefined,
          create: current
            ? undefined
            : {
                ...input,
                description: r.idea.headline,
                stateId: cfg.states.new,
                labelIds: cfg.labels[p.category]
                  ? [cfg.labels[p.category]]
                  : [],
              },
          event,
          result: {
            ok: true,
            idea: { id: r.idea.id, version: r.idea.version },
          },
        };
      });
      if (op.create) await createIssue(op);
      return commit(op);
    }
    if (path === "/api/context") {
      if (!cfg.mePath) fail(400, "Configure a private mePath first");
      if (
        typeof p.text !== "string" ||
        !p.text.trim() ||
        p.text.length > 100000
      )
        fail(400, "Invalid profile");
      if (existsSync(cfg.mePath))
        writeFileSync(cfg.mePath + ".previous", readFileSync(cfg.mePath), {
          mode: 0o600,
        });
      writeFileSync(cfg.mePath + ".tmp", p.text, { mode: 0o600 });
      renameSync(cfg.mePath + ".tmp", cfg.mePath);
      return { ok: true };
    }
    if (path === "/api/ideas/action") {
      const id = Number(p.id),
        issueId = issueIdFor(id);
      if (!issueId) fail(404, "Ticket not found");
      if (!["do", "change", "no"].includes(p.action))
        fail(400, "Invalid decision");
      const key = hash([id, p.version, p.action, p.label, p.prompt, p.note]);
      const prior = journal.operations[key];
      if (prior?.completed) return prior.result;
      await fresh(issueId);
      const current = records.get(id);
      if (current.idea.version !== p.version)
        fail(409, "Card version changed. Review the current revision.");
      if (!prior && status(live.get(id)) !== p.status)
        fail(409, "Linear state changed. Refresh before deciding.");
      if (
        prior &&
        !prior.completed &&
        ![p.status, prior.event.record.idea.status].includes(
          status(live.get(id)),
        )
      )
        fail(
          409,
          "Linear changed during the interrupted save. Reconcile before retrying.",
        );
      if (
        !prior &&
        current.jobs.at(-1)?.bridgeCreated &&
        ["queued", "running"].includes(current.jobs.at(-1)?.status)
      )
        fail(409, "This ticket already has queued work");
      const op = operation(key, () => {
        const r = structuredClone(current),
          now = new Date().toISOString();
        attention(p);
        r.attention = structuredClone(records.get(id).attention);
        const a = r.attention?.find((a) => a.version === p.version);
        if (a)
          Object.assign(a, {
            decision_action: p.action,
            decision_source: "user",
            decision_label: p.label,
            decided_at: now,
            wall_ms: Math.max(0, Date.now() - date(a.first_viewed_at)),
          });
        const j =
          p.action === "no"
            ? null
            : {
                id: allocate(),
                idea_id: id,
                action: p.action,
                button_label: String(p.label || p.action).slice(0, 120),
                instruction: String(p.prompt || "").slice(0, 20000),
                user_feedback: String(p.note || "").slice(0, 20000),
                card_context: JSON.stringify({
                  idea: card(current),
                  approvedVersion: p.version,
                  actorId: cfg.userId,
                  linearIssueId: issueId,
                }),
                status: "queued",
                ticket_outcome: null,
                result: "",
                created_at: now,
                updated_at: now,
                bridgeCreated: true,
              };
        if (j) r.jobs.push(j);
        r.feedback.push({
          id: allocate(),
          idea_id: id,
          decision: p.action,
          note: String(p.note || ""),
          created_at: now,
        });
        r.idea.status = p.action === "no" ? "rejected" : "working";
        return {
          issueId,
          input: { stateId: cfg.states[r.idea.status] },
          event: {
            kind: "decision",
            summary: `Agency: ${String(p.label || p.action).slice(0, 120)}\n\n${String(p.note || "")}\n\nRevision ${p.version}. ${p.action === "no" ? "Canceled, not completed." : p.action === "change" ? "Feedback requires interpreting the exact words. Improve alone never authorizes an outward action." : "Only the exact saved action is approved; recheck the target before execution."}`,
            record: r,
          },
          result: { ok: true, jobId: j?.id },
        };
      });
      return commit(op);
    }
    if (path === "/api/linear/assignee") {
      const id = issueIdFor(p.id);
      if (!id || !cfg.members.some((m) => m.id === p.assigneeId))
        fail(400, "Unknown ticket or teammate");
      await fresh(id);
      await update(id, { assigneeId: p.assigneeId });
      save("bridge-live.json", { syncedAt, issues: [...live] });
      return { ok: true };
    }
    if (path === "/api/agent-jobs/reconcile") {
      let r = [...records.values()].find((r) => r.jobs.at(-1)?.id === p.id);
      if (!r) fail(404, "Latest imported job not found");
      const issueId = issueIdFor(r.idea.id);
      await fresh(issueId);
      r = records.get(r.idea.id);
      const j = r.jobs.at(-1);
      const key = hash([
        "reconcile",
        p.id,
        p.outcome,
        p.result,
        p.liveTarget,
        p.workerId,
      ]);
      if (journal.operations[key]?.completed)
        return journal.operations[key].result;
      if (j.bridgeCreated || !["queued", "running"].includes(j.status))
        fail(409, "Only unfinished imported jobs need reconciliation");
      if (["done", "rejected"].includes(status(live.get(r.idea.id))))
        fail(409, "The native ticket is already closed");
      if (
        !p.workerId ||
        !String(p.liveTarget || "").trim() ||
        !String(p.result || "").trim()
      )
        fail(
          400,
          "workerId, liveTarget and verified reconciliation result are required",
        );
      if (!["resume", "completed", "review", "blocked"].includes(p.outcome))
        fail(400, "Invalid reconciliation outcome");
      if (p.outcome === "resume" && p.approvalStillValid !== true)
        fail(
          400,
          "Check the exact saved scope and current target before resuming",
        );
      const op = operation(key, () => {
        const next = structuredClone(r),
          job = next.jobs.at(-1);
        Object.assign(job, {
          bridgeCreated: true,
          status:
            p.outcome === "resume"
              ? "queued"
              : p.outcome === "blocked"
                ? "failed"
                : "done",
          ticket_outcome: p.outcome === "resume" ? null : p.outcome,
          result: p.result,
          updated_at: new Date().toISOString(),
          reconciliation: {
            workerId: p.workerId,
            liveTarget: p.liveTarget,
            approvalStillValid: p.approvalStillValid === true,
          },
        });
        next.idea.status =
          p.outcome === "completed"
            ? "done"
            : p.outcome === "review"
              ? "new"
              : "working";
        return {
          issueId,
          input: { stateId: cfg.states[next.idea.status] },
          event: {
            kind: "reconciliation",
            summary: `Imported job #${j.id}: ${p.outcome}\n\nLive target: ${p.liveTarget}\n\n${p.result}`,
            record: next,
          },
          result: { ok: true, jobId: j.id, ideaStatus: next.idea.status },
        };
      });
      return commit(op);
    }
    if (path === "/api/agent-jobs") {
      let r = [...records.values()].find((r) =>
        r.jobs.some((j) => j.id === p.id),
      );
      if (!r) fail(404, "Job not found");
      const issueId = issueIdFor(r.idea.id);
      await fresh(issueId);
      r = records.get(r.idea.id);
      const j = r.jobs.find((j) => j.id === p.id);
      if (!j.bridgeCreated)
        fail(
          409,
          "Imported job is paused. Reconcile its live target before creating a fresh decision.",
        );
      if (status(live.get(r.idea.id)) === "rejected")
        fail(409, "Ticket was canceled in Linear. Do not continue the job.");
      if (!["running", "done", "failed"].includes(p.status))
        fail(400, "Invalid status");
      if (!p.workerId || typeof p.workerId !== "string")
        fail(400, "workerId is required");
      if (j.workerId && j.workerId !== p.workerId)
        fail(409, "Another worker owns this job");
      if (
        p.status !== "running" &&
        j.status !== "running" &&
        j.status !== p.status
      )
        fail(409, "Claim this job before completing it");
      if (["done", "failed"].includes(j.status) && j.status !== p.status)
        fail(409, "Job already finalized");
      if (
        p.status === "done" &&
        !["completed", "review"].includes(p.ticketOutcome)
      )
        fail(400, "Done needs completed or review");
      if (p.status === "failed" && p.ticketOutcome !== "blocked")
        fail(400, "Failed needs blocked");
      if (p.status === "done" && !String(p.result || "").trim())
        fail(400, "Record evidence of the result");
      const key = hash([
        "job",
        p.id,
        p.status,
        p.ticketOutcome,
        p.result,
        p.workerId,
      ]);
      if (["done", "failed"].includes(j.status) && !journal.operations[key])
        fail(409, "A finalized outcome cannot be rewritten");
      const op = operation(key, () => {
        const next = structuredClone(r),
          job = next.jobs.find((j) => j.id === p.id);
        Object.assign(job, {
          status: p.status,
          ticket_outcome: p.ticketOutcome ?? null,
          result: String(p.result || "").slice(0, 20000),
          workerId: p.workerId,
          updated_at: new Date().toISOString(),
        });
        next.idea.status =
          p.status === "running"
            ? "working"
            : p.ticketOutcome === "completed"
              ? "done"
              : p.ticketOutcome === "blocked"
                ? "working"
                : "new";
        return {
          issueId,
          input: { stateId: cfg.states[next.idea.status] },
          event: {
            kind: "job",
            summary: `Agency job #${p.id}: ${p.ticketOutcome || p.status}\n\n${job.result}`,
            record: next,
          },
          result: {
            ok: true,
            ticketOutcome: job.ticket_outcome,
            ideaStatus: next.idea.status,
          },
        };
      });
      return commit(op);
    }
    fail(501, "This operation is not connected. Nothing was saved.");
  }
  function jobs(url) {
    const includeImported = url.searchParams.get("includeImported") === "1";
    return {
      jobs: [...records.values()]
        .filter((r) => live.has(r.idea.id))
        .flatMap((r) =>
          r.jobs
            .slice(-1)
            .filter(
              (j) =>
                (j.bridgeCreated || includeImported) &&
                ["queued", "running"].includes(j.status),
            )
            .map((j) => ({
              ...camel(j),
              importedPendingPaused: !j.bridgeCreated,
              history: r.jobs.filter((h) => h.id < j.id).map(camel),
            })),
        ),
      importedPendingPaused: true,
    };
  }
  return {
    state,
    stats,
    sync,
    mutate,
    jobs,
    topics,
    records,
    manifest,
    journal,
    live: () => live,
    card,
    fresh,
    commit,
    operation,
    issueIdFor,
    persist,
    save,
    api,
    cfg,
    mapping,
    update,
  };
}

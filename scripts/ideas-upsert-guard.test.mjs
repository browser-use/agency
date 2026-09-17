import { registerHooks } from 'node:module';
import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The route runs on Workers and imports extensionless TypeScript, so resolve
// both through hooks before the route module is imported.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === 'cloudflare:workers') return { url: 'data:text/javascript,export const env = globalThis.__agencyUpsertGuardEnv;', shortCircuit: true };
    if (specifier.startsWith('.')) {
      const url = new URL(specifier, context.parentURL);
      for (const suffix of ['.ts', '/index.ts']) {
        const candidate = new URL(url.href + suffix);
        if (existsSync(fileURLToPath(candidate))) return { url: candidate.href, shortCircuit: true };
      }
    }
    return nextResolve(specifier, context);
  },
});

class D1Adapter {
  constructor(sqlite) { this.sqlite = sqlite; }
  prepare(sql) {
    const db = this.sqlite;
    const statement = {
      sql,
      args: [],
      bind(...args) { this.args = args; return this; },
      async first() { return db.prepare(sql).get(...this.args) ?? null; },
      async all() { return { results: db.prepare(sql).all(...this.args) }; },
      async run() { return db.prepare(sql).run(...this.args); },
      execute() { return db.prepare(sql).run(...this.args); },
    };
    return statement;
  }
  async batch(statements) {
    this.sqlite.exec('BEGIN IMMEDIATE');
    try {
      const results = statements.map(s => s.execute());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) { this.sqlite.exec('ROLLBACK'); throw error; }
  }
}

const sqlite = new DatabaseSync(':memory:');
globalThis.__agencyUpsertGuardEnv = { DB: new D1Adapter(sqlite) };
const { POST } = await import('../app/api/ideas/route.ts');

const doCardHtml = filler => `<article data-radar-action="do">${filler.repeat(20)}</article>`;
const card = (dedupeKey, extra = {}) => ({
  project: 'Example',
  category: 'Work',
  headline: 'Atomic upsert guard',
  cardHtml: doCardHtml('content '),
  agentContext: { note: 'fixture' },
  score: 50,
  dedupeKey,
  ...extra,
});
const post = body => POST(new Request('http://localhost:3100/api/ideas', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-radar-local-agent': '1' },
  body: JSON.stringify(body),
}));
const storedIdea = dedupeKey => sqlite.prepare('SELECT * FROM ideas WHERE dedupe_key = ?').get(dedupeKey);

test('a new dedupe key ingests normally without expectedVersion', async () => {
  const response = await post(card('guard-new-key'));
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.idea.version, 1);
  const row = storedIdea('guard-new-key');
  assert.ok(row);
  assert.equal(row.status, 'new');
  assert.ok(row.card_html.includes('content'));
});

test('an existing key without a matching expectedVersion gets 409 and is left unchanged', async () => {
  await post(card('guard-conflict'));
  const withoutVersion = await post(card('guard-conflict', { cardHtml: doCardHtml('replacement ') }));
  assert.equal(withoutVersion.status, 409);
  assert.equal((await withoutVersion.json()).storedVersion, 1);
  const withWrongVersion = await post(card('guard-conflict', { expectedVersion: 99 }));
  assert.equal(withWrongVersion.status, 409);
  assert.equal((await withWrongVersion.json()).storedVersion, 1);
  const row = storedIdea('guard-conflict');
  assert.equal(row.version, 1);
  assert.ok(row.card_html.includes('content'));
  assert.ok(!row.card_html.includes('replacement'));
});

test('an existing key with the current expectedVersion updates and bumps the version', async () => {
  await post(card('guard-match'));
  const response = await post(card('guard-match', { expectedVersion: 1, cardHtml: doCardHtml('replacement ') }));
  assert.equal(response.status, 201);
  const payload = await response.json();
  assert.equal(payload.idea.version, 2);
  const row = storedIdea('guard-match');
  assert.equal(row.version, 2);
  assert.ok(row.card_html.includes('replacement'));
});

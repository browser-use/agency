import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {BLOCKED_CARD_UPDATE_SQL, cardIngestMode, needsFallbackAction} from '../lib/blocked-card.ts';

const html='<section data-radar-state="blocked"><h2>Merge withheld</h2><p>The approved merge method is unavailable.</p></section>';
const action='<button data-radar-action="do">Merge</button>';
test('renderer never invents actions for explicit or legacy blocked results',()=>{
  assert.equal(needsFallbackAction(true,true,null),false);
  assert.equal(needsFallbackAction(true,false,'blocked'),false);
  assert.equal(needsFallbackAction(true,false,'review'),true);
  assert.equal(needsFallbackAction(true,false,null),true);
  assert.equal(needsFallbackAction(false,false,null),false);
});
test('blocked cards need exact identity and cannot smuggle an action',()=>{
  assert.equal(cardIngestMode(action),'actionable');
  assert.equal(cardIngestMode(html),null);
  assert.equal(cardIngestMode(html,7,2),'blocked');
  for (const [id,version] of [[0,2],[-1,2],[7,0],[7,undefined],['7',2],[7,'2']]) assert.equal(cardIngestMode(html,id,version),null);
  assert.equal(cardIngestMode('<section>blocked</section>',7,2),null);
  assert.equal(cardIngestMode(html+action,7,2),null);
});

function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'agency-blocked-card-'));
  t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const db=join(dir,'test.sqlite');
  const query=sql=>execFileSync('sqlite3',['-json',db],{input:sql}).toString();
  query(`CREATE TABLE ideas(id INTEGER PRIMARY KEY,dedupe_key TEXT,version INTEGER,status TEXT,headline TEXT,card_html TEXT,agent_context TEXT,score INTEGER,created_at TEXT);
    CREATE TABLE agent_jobs(id INTEGER PRIMARY KEY,idea_id INTEGER,status TEXT,ticket_outcome TEXT);
    INSERT INTO ideas VALUES(1,'canonical',2,'new','old','old html','old context',72,'original');
    INSERT INTO agent_jobs VALUES(7,1,'failed','blocked');`);
  const literal=x=>typeof x==='number'?String(x):`CAST(X'${Buffer.from(x).toString('hex')}' AS TEXT)`;
  const update=(key='canonical',version=2,id=7)=>{
    const values=['Merge withheld',html,'new context',key,version,id];let i=0;
    return JSON.parse(query(BLOCKED_CARD_UPDATE_SQL.replace(/\?/g,()=>literal(values[i++]))+';')||'[]');
  };
  return{query,update};
}
test('blocked replacement preserves history, lane, score, timestamps and cannot replay',t=>{
  const {query,update}=fixture(t);
  assert.deepEqual(update(),[{id:1,version:3}]);
  assert.deepEqual(JSON.parse(query('SELECT version,status,score,created_at FROM ideas;')),[{version:3,status:'new',score:72,created_at:'original'}]);
  assert.deepEqual(JSON.parse(query('SELECT status,ticket_outcome FROM agent_jobs;')),[{status:'failed',ticket_outcome:'blocked'}]);
  assert.deepEqual(update(),[]);
});
for(const [name,mutation] of Object.entries({
  version:'UPDATE ideas SET version=3',
  done:"UPDATE ideas SET status='done'",
  skipped:"UPDATE ideas SET status='rejected'",
  queued:"INSERT INTO agent_jobs VALUES(8,1,'queued',NULL)",
  running:"UPDATE agent_jobs SET status='running',ticket_outcome=NULL",
  review:"UPDATE agent_jobs SET ticket_outcome='review'",
  otherCard:'UPDATE agent_jobs SET idea_id=2',
})) test(`blocked replacement refuses ${name} drift`,t=>{
  const {query,update}=fixture(t);query(mutation);
  assert.deepEqual(update(),[]);
  assert.equal(JSON.parse(query('SELECT card_html FROM ideas;'))[0].card_html,'old html');
});
test('blocked replacement never inserts a new card or uses an unrelated job',t=>{
  const {query,update}=fixture(t);
  assert.deepEqual(update('new-card'),[]);assert.deepEqual(update('canonical',2,8),[]);
  assert.equal(JSON.parse(query('SELECT count(*) AS n FROM ideas;'))[0].n,1);
});

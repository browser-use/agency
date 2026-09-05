import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {applyPresentationUpdates} from '../lib/presentation-update.mjs';

function fixture(t){
  const dir=mkdtempSync(join(tmpdir(),'agency-presentation-test-'));t.after(()=>rmSync(dir,{recursive:true,force:true}));
  const db=join(dir,'test.sqlite');
  const query=s=>execFileSync('sqlite3',['-json',db],{input:s}).toString();
  query(`CREATE TABLE ideas(id INTEGER PRIMARY KEY,version INTEGER,status TEXT,headline TEXT,card_html TEXT,created_at TEXT);CREATE TABLE agent_jobs(idea_id INTEGER,status TEXT);INSERT INTO ideas VALUES(1,2,'new','old 1','a','original'),(2,2,'new','old 2','b','original');`);
  const changes=[{id:1,expectedVersion:2,headline:'new 1',oldHtml:'a',html:'aa'},{id:2,expectedVersion:2,headline:'new 2',oldHtml:'b',html:'bb'}];
  return{db,query,changes};
}
test('presentation changes preserve statuses and ordering timestamps',t=>{
  const{db,query,changes}=fixture(t);applyPresentationUpdates(db,changes);
  const rows=JSON.parse(query('SELECT * FROM ideas ORDER BY id'));
  assert.deepEqual(rows.map(r=>[r.version,r.status,r.created_at]),[[3,'new','original'],[3,'new','original']]);
});
for(const [name,mutation]of Object.entries({version:'UPDATE ideas SET version=3 WHERE id=2',status:"UPDATE ideas SET status='done' WHERE id=2",job:"INSERT INTO agent_jobs VALUES(2,'queued')",html:"UPDATE ideas SET card_html='user edit' WHERE id=2"})){
  test(`${name} race on final card rolls back the entire batch`,t=>{
    const{db,query,changes}=fixture(t);query(mutation);
    assert.throws(()=>applyPresentationUpdates(db,changes));
    assert.deepEqual(JSON.parse(query('SELECT version,headline,card_html FROM ideas WHERE id=1')),[{version:2,headline:'old 1',card_html:'a'}]);
  });
}

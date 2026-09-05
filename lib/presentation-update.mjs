import {execFileSync} from 'node:child_process';
const literal=s=>`CAST(X'${Buffer.from(String(s)).toString('hex')}' AS TEXT)`;

export function applyPresentationUpdates(db,changes){
  const statements=changes.map(c=>{
    if(!Number.isSafeInteger(c.id)||!Number.isSafeInteger(c.expectedVersion))throw new Error('Invalid identity');
    return `UPDATE ideas SET card_html=${literal(c.html)}, headline=${literal(c.headline)}, version=version+1 WHERE id=${c.id} AND version=${c.expectedVersion} AND status='new' AND card_html=${literal(c.oldHtml)} AND NOT EXISTS(SELECT 1 FROM agent_jobs WHERE idea_id=${c.id} AND status IN ('queued','running'));
INSERT INTO presentation_guard VALUES (changes());
SELECT ${c.id} AS id, 1 AS updated;`;
  });
  // CHECK failures with .bail terminate this connection; its uncommitted
  // transaction rolls back every preceding update, including on a last-card race.
  const input=`.bail on\n.timeout 3000\nCREATE TEMP TABLE presentation_guard (ok INTEGER CHECK(ok=1));\nBEGIN IMMEDIATE;\n${statements.join('\n')}\nCOMMIT;`;
  return execFileSync('sqlite3',['-json',db],{input,maxBuffer:2_000_000,stdio:['pipe','pipe','pipe']}).toString();
}

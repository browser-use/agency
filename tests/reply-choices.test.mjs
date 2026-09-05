import test from 'node:test';
import assert from 'node:assert/strict';
import {renderReplyChoices} from '../lib/reply-choices.mjs';
const options=[{label:'A',text:'first <safe> question?'},{label:'B',text:'second & useful question?'},{label:'C',text:'third "exact" question?'}];
test('Three complete drafts bind only their selected message to three separate actions',()=>{
 const html=renderReplyChoices({options,promptFor:(text,n)=>`Send only option ${n}. Exact text:\n${text}`});
 const sections=[...html.matchAll(/<section class="reply-choice">([\s\S]*?)<\/section>/g)];
 assert.equal(sections.length,3);
 for(const [i,match] of sections.entries()){
  const decode=s=>s.replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
  const visible=decode(match[1].match(/<p>([\s\S]*?)<\/p>/)[1]);
  const prompt=decode(match[1].match(/data-radar-prompt="([^"]+)"/)[1]);
  assert.equal(visible,options[i].text);
  assert.ok(prompt.endsWith(visible));
  for(let j=0;j<3;j++)if(j!==i)assert.ok(!prompt.includes(options[j].text));
 }
 assert.ok(!html.includes('<safe>'));
});
test('Missing, duplicate and mismatched options cannot become send cards',()=>{
 assert.throws(()=>renderReplyChoices({options:options.slice(0,2),promptFor:x=>x}));
 assert.throws(()=>renderReplyChoices({options:[options[0],options[0],options[2]],promptFor:x=>x}));
 assert.throws(()=>renderReplyChoices({options,promptFor:()=> 'send all'}));
 assert.throws(()=>renderReplyChoices({options,promptFor:()=>options.map(x=>x.text).join('\n')}));
});

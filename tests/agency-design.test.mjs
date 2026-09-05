import test from 'node:test';
import assert from 'node:assert/strict';
import { actionsFrom, detailsFrom, renderCard, comparisonSvg, cardCss } from '../lib/agency-card-design.mjs';

const button='<button data-radar-action="do" data-radar-prompt="Send exactly: A &amp; B. No other action.">Send A &amp; B</button>';
const source={project:'Example',headline:'Explain the change.',card_html:`<article><details><summary>See exact diff</summary><pre>+one\n-two</pre><details><summary>Risk</summary>Unknown</details></details>${button}<button data-radar-action="open" data-radar-url="https://example.com/?a=1&amp;b=2">Open original</button></article>`};
const spec={kind:'Private proof',problem:'A precise observed problem.',who:'One reporter',diagram:{alt:'before and after',before:['old'],after:['new']},checks:['A test passed'],gaps:['Live test not run'],forYou:'One exact change.'};
test('refresh retains every exact action attribute and label, in order',()=>{
  const html=renderCard({source,spec,assetBase:'/agent-assets/test'});
  assert.deepEqual(actionsFrom(html),actionsFrom(source.card_html));
  assert.equal((html.match(/data-radar-action="do"/g)||[]).length,1);
});
test('nested evidence and the complete selectable diff survive byte for byte',()=>{
  assert.equal(detailsFrom(source.card_html).length,1);
  const html=renderCard({source,spec,assetBase:'/agent-assets/test'});
  assert.ok(html.includes(detailsFrom(source.card_html)[0]));
  assert.ok(html.includes('font-size:13px!important'));
});
test('exact reply is escaped without rewriting its text; missing gates stay visible',()=>{
  const messageSource={...source,card_html:`<details><summary>Exact reply</summary><p>old</p></details>${source.card_html}`};
  const html=renderCard({source:messageSource,spec:{...spec,message:'A < B & C\nsecond line',recipient:'@recipient',replacedMessageSummary:'Exact reply'},assetBase:'/agent-assets/test'});
  assert.ok(html.includes('A &lt; B &amp; C\nsecond line'));
  assert.ok(html.includes('Live test not run'));
  assert.ok(!html.includes('<svg'));
});
test('missing, typoed, or ambiguous exact-message panels fail closed',()=>{
  const panel='<details><summary>Exact reply</summary><p>old</p></details>';
  for(const [count,summary] of [[0,'Exact reply'],[1,'Exact typo'],[2,'Exact reply'],[1,undefined]]){
    assert.throws(()=>renderCard({source:{...source,card_html:panel.repeat(count)+source.card_html},spec:{...spec,message:'new',replacedMessageSummary:summary},assetBase:'/test'}),/must match one/);
  }
});
test('long original can be collapsed without deleting a byte of the source',()=>{
  const text='Full original\n'.repeat(100);
  const html=renderCard({source,spec:{...spec,original:text,originalCollapsed:true,originalLabel:'Source'},assetBase:'/test'});
  assert.ok(html.includes('<details><summary>Read full original · Source</summary>'));
  assert.ok(html.includes(text));
});
test('pending validation uses amber rather than success green',()=>{
  const svg=comparisonSvg({...spec.diagram,pending:true},true);
  assert.ok(svg.includes('#fff7e6'));
  assert.ok(!svg.includes('#eaf7f0'));
  assert.ok(svg.includes('font-size="19"'));
});
test('secondary labels and the mobile diagram stay readable',()=>{
  assert.ok(cardCss.includes('.agency-v2 .av-kicker,.agency-v2 .av-label,.agency-v2 .av-statline span{font-size:14px}'));
  const svg=comparisonSvg({...spec.diagram,pending:true},true);
  const sizes=[...svg.matchAll(/font-size="(\d+)"/g)].map(m=>Number(m[1]));
  assert.ok(sizes.length>0 && sizes.every(size=>size>=16));
});
test('a message replacement retains exact-head, exact-source, and postcondition evidence',()=>{
  const messageSource={...source,card_html:`<details><summary>Exact reply</summary><p>old reply</p></details><details><summary>Exact source + collision proof</summary><p>no reply found</p></details>${source.card_html}`};
  const html=renderCard({source:messageSource,spec:{...spec,message:'new reply',recipient:'@r',replacedMessageSummary:'Exact reply'},assetBase:'/agent-assets/test'});
  assert.ok(!html.includes('<p>old reply</p>'));
  assert.ok(html.includes('<p>no reply found</p>'));
  assert.ok(html.includes('See exact diff'));
  assert.ok(html.includes('Unknown'));
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { shortDashes, shortDashesHtml, shortDashesStoredContext } from '../lib/agency-dashes.ts';

test('authored text uses ASCII hyphens, including HTML entities', () => {
  assert.equal(shortDashes('hey — yes – fine &mdash; &ndash; &#8212; &#x2014; &#08211;'), 'hey - yes - fine - - - - -');
  assert.equal(shortDashes('keep --flags and CSS --custom'), 'keep --flags and CSS --custom');
});

test('literal code and URLs remain exact', () => {
  const text = 'hey — `x—y` ```\nx—y\n``` https://example.com/a—b end –';
  assert.equal(shortDashes(text), 'hey - `x—y` ```\nx—y\n``` https://example.com/a—b end -');
});

test('visible draft, alternate text, and final action match', () => {
  const html = '<img src="/a—b.svg" alt="problem — solved"><pre class="exact">hey — can we help?</pre><button data-radar-prompt="Send exactly: hey — can we help?">Send — once</button>';
  assert.equal(shortDashesHtml(html), '<img src="/a—b.svg" alt="problem - solved"><pre class="exact">hey - can we help?</pre><button data-radar-prompt="Send exactly: hey - can we help?">Send - once</button>');
});

test('diffs, CSS, and original sources stay byte-for-byte', () => {
  const protectedHtml = '<style>.x:before{content:"—"}</style><code>x—y</code><pre class="diff"><span class="add">+// x—y</span></pre><blockquote>their words — exact</blockquote><details><summary>Exact public trigger</summary><pre class="exact">their words — exact</pre></details>';
  assert.equal(shortDashesHtml(protectedHtml + '<p>my words — edited</p>'), protectedHtml + '<p>my words - edited</p>');
});

test('outbound blockquotes and mail drafts are prose, even when they discuss code or a patch', () => {
  const html = '<blockquote class="av-message">hi — there</blockquote><pre class="mail">hey — there</pre><pre class="reply">hey — i tested the patch and code</pre>';
  assert.equal(shortDashesHtml(html), '<blockquote class="av-message">hi - there</blockquote><pre class="mail">hey - there</pre><pre class="reply">hey - i tested the patch and code</pre>');
});

test('nested drafts normalize but history, evidence, user notes, and URLs do not', () => {
  const context = { exactEmail: { body: 'hey — there' }, previousEmail: { body: 'sent — already' }, evidence: ['quoted — words'], sourceUrl: 'https://x.com/a—b', click: { instruction: 'Send hey — there', note: 'my — feedback' }, idea: { cardHtml: '<p>hey — there</p>', agentContext: JSON.stringify({ exactReply: 'hi — you' }) } };
  const result = JSON.parse(shortDashesStoredContext(JSON.stringify(context)));
  assert.equal(result.exactEmail.body, 'hey - there');
  assert.deepEqual(result.previousEmail, context.previousEmail);
  assert.deepEqual(result.evidence, context.evidence);
  assert.equal(result.sourceUrl, context.sourceUrl);
  assert.equal(result.click.note, context.click.note);
  assert.equal(result.click.instruction, 'Send hey - there');
  assert.equal(result.idea.cardHtml, '<p>hey - there</p>');
  assert.equal(JSON.parse(result.idea.agentContext).exactReply, 'hi - you');
});

test('normalization is idempotent and does not reformat unchanged JSON', () => {
  const json = '{ "evidence": "real — quote" }';
  assert.equal(shortDashesStoredContext(json), json);
  const html = '<p>x &mdash; y</p><code>x—y</code>';
  const once = shortDashesHtml(html);
  assert.equal(shortDashesHtml(once), once);
});

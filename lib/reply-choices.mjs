import {escapeHtml as e} from './agency-card-design.mjs';

export const replyChoicesCss = `.agency-v2 .reply-choices{padding:0 30px 20px}.agency-v2 .reply-choice{display:grid;grid-template-columns:32px minmax(0,1fr);gap:12px;padding:20px 0;border-top:1px solid var(--line)}.agency-v2 .reply-index{color:#9ba1a8;font:500 22px/1.4 ui-monospace,monospace}.agency-v2 .reply-choice p{margin:8px 0 14px;white-space:pre-wrap;font-size:17px;line-height:1.6}.agency-v2 .reply-choice button{min-height:44px;font:600 15px/1.4 system-ui;padding:10px 18px;border:1px solid #b6bdc5;border-radius:8px;color:#17212b;background:#fff;cursor:pointer}.agency-v2 .reply-choice:first-child button{background:#17212b;color:white;border-color:#17212b}@media(max-width:600px){.agency-v2 .reply-choices{padding:0 20px 16px}.agency-v2 .reply-choice{grid-template-columns:24px minmax(0,1fr);gap:8px}.agency-v2 .reply-choice p{font-size:16px}}`;

export function renderReplyChoices({options, promptFor}) {
  if (options.length !== 3 || new Set(options.map(x=>x.text)).size !== 3) throw Error('Three distinct complete message options required');
  return `<div class="reply-choices">${options.map((option,index)=>{
    if (!option.text.trim() || /[\u2013\u2014]/.test(option.text)) throw Error('Empty or long-dash reply');
    const prompt=promptFor(option.text,index+1);
    if (!prompt.includes(option.text)) throw Error('Selected exact message missing from prompt');
    if (options.some((other,j)=>j!==index&&prompt.includes(other.text))) throw Error('Prompt includes unselected option');
    return `<section class="reply-choice"><span class="reply-index">${index+1}</span><div><span class="av-label">${e(option.label)}${index===0?' · recommended':''}</span><p>${e(option.text)}</p><button data-radar-action="do" data-radar-prompt="${e(prompt)}">Send option ${index+1}</button></div></section>`;
  }).join('')}</div>`;
}

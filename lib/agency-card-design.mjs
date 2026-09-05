// Self-contained presentation for private Agency cards. No network or executable card scripts.
export const escapeHtml = (s) => String(s).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');

export function actionsFrom(html) {
  return [...html.matchAll(/<button\b[^>]*>[\s\S]*?<\/button>/gi)].map(m => m[0]).filter(s => /data-radar-action=["'](?:do|open)["']/.test(s));
}

export function detailsFrom(html) {
  const result = []; let depth = 0; let start = 0;
  for (const m of html.matchAll(/<\/?details\b[^>]*>/gi)) {
    if (!m[0].startsWith('</')) { if (depth++ === 0) start = m.index; }
    else if (--depth === 0) result.push(html.slice(start, m.index + m[0].length));
  }
  if (depth !== 0) throw new Error('Unbalanced source details');
  return result;
}

export const cardCss = `
.agency-v2{--ink:#17191c;--muted:#626870;--line:#e1e5e9;--accent:#e84f2b;--green:#126748;--red:#ad342c;box-sizing:border-box;max-width:920px;margin:0 auto;background:#fff;color:var(--ink);font:16px/1.5 ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;border:1px solid var(--line);border-radius:18px;overflow:clip}
.agency-v2 *{box-sizing:border-box}.agency-v2 .av-head{padding:28px 30px 20px}.agency-v2 .av-kicker{display:flex;gap:12px;flex-wrap:wrap;align-items:center;font:650 12px/1.4 ui-monospace,monospace;letter-spacing:.05em;text-transform:uppercase;color:var(--muted)}.agency-v2 .av-kicker>span:first-child{color:var(--accent)}
.agency-v2 h1{font-size:clamp(28px,4vw,40px);line-height:1.1;letter-spacing:-.035em;font-weight:700;margin:12px 0;max-width:820px;text-wrap:balance}.agency-v2 .av-lead{font-size:17px;line-height:1.5;margin:0;color:#4c535b;max-width:760px}.agency-v2 .av-who{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;margin-top:16px;font-size:14px;color:#424a54}.agency-v2 .av-label{font:650 11px/1.4 ui-monospace,monospace;letter-spacing:.07em;color:var(--muted);text-transform:uppercase;white-space:nowrap}
.agency-v2 .av-visual{margin:0 30px 20px}.agency-v2 .av-visual img{width:100%;height:auto;display:block}.agency-v2 .av-visual figcaption{font-size:14px;color:var(--muted);padding:8px 0 0}.agency-v2 .av-proof{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap;border-top:1px solid var(--line);border-bottom:1px solid var(--line);padding:15px 30px}.agency-v2 .av-proof>.av-label{padding-top:5px}.agency-v2 .av-checks{display:flex;gap:7px 12px;flex-wrap:wrap;flex:1;min-width:0}.agency-v2 .av-check{font-size:14px;color:var(--green)}.agency-v2 .av-check::before{content:'✓ ';font-weight:800}.agency-v2 .av-gap{font-size:14px;color:#5b626b}.agency-v2 .av-gap::before{content:'○ ';font-weight:800}
.agency-v2 .av-result{padding:17px 30px;display:flex;align-items:baseline;gap:14px}.agency-v2 .av-result p{margin:0;font-size:15px}.agency-v2 .av-details{padding:0 30px 20px}.agency-v2 details{margin:0!important;border:0!important;border-top:1px solid var(--line)!important;background:#fff!important;color:var(--ink)!important;border-radius:0!important;min-width:0;overflow:hidden}.agency-v2 summary{padding:15px 0!important;cursor:pointer;font:600 15px/1.5 ui-sans-serif,system-ui!important;color:var(--ink)!important}.agency-v2 details>div{padding:0 0 18px!important;font-size:14px!important;line-height:1.6!important;color:#434a54!important;min-width:0}.agency-v2 details p{font-size:14px!important;line-height:1.6!important}.agency-v2 details ul{padding-left:20px}
.agency-v2 pre{display:block;max-width:100%;margin:0 0 12px!important;padding:16px!important;overflow:auto!important;background:#f6f8fa!important;color:#24292f!important;border:1px solid var(--line)!important;border-radius:9px!important;font:13px/1.7 ui-monospace,SFMono-Regular,Consolas,monospace!important;white-space:pre!important;tab-size:2}.agency-v2 pre *{font:inherit!important}.agency-v2 .av-message{margin:0 0 18px;padding:18px 20px;border-left:3px solid var(--accent);background:#fafafa;color:var(--ink);white-space:pre-wrap;font:17px/1.65 ui-sans-serif,system-ui;overflow-wrap:anywhere}.agency-v2 .add,.agency-v2 .plus,.agency-v2 .addition{background:#dafbe1!important;color:#116329!important;display:block;min-width:max-content}.agency-v2 .del,.agency-v2 .minus,.agency-v2 .deletion{background:#ffebe9!important;color:#a1221c!important;display:block;min-width:max-content}.agency-v2 .hunk,.agency-v2 .patch-hunk{background:#ddf4ff!important;color:#0969da!important;display:block;min-width:max-content}.agency-v2 .file,.agency-v2 .file-header{font-weight:700!important;background:#eaeef2!important;color:#24292f!important;display:block;min-width:max-content}.agency-v2 .ctx{color:#57606a!important}
.agency-v2 .av-actions{padding:18px 30px;background:#fafbfc;border-top:1px solid var(--line);display:flex;gap:10px;flex-wrap:wrap}.agency-v2 .av-actions button{min-height:46px;padding:11px 18px;border:1px solid #d4d9df;border-radius:9px;background:white;color:var(--ink);font:600 14px/1.4 ui-sans-serif,system-ui;cursor:pointer;max-width:100%;overflow-wrap:anywhere}.agency-v2 .av-actions [data-radar-action=do]{background:#191b1e;color:white;border-color:#191b1e;flex:1}.agency-v2 button:focus-visible,.agency-v2 summary:focus-visible{outline:3px solid #ff8f6b;outline-offset:3px}.agency-v2 .av-video{padding:0 30px 20px}.agency-v2 video{display:block;width:100%;height:auto;border-radius:10px;background:#111}.agency-v2 .av-statline{display:flex;gap:22px;flex-wrap:wrap;margin:14px 0 0}.agency-v2 .av-statline b{font-size:22px;font-weight:650;letter-spacing:-.02em}.agency-v2 .av-statline span{font-size:13px;color:var(--muted);display:block}
.agency-v2 .av-original{margin:0 30px 20px;padding:16px 20px;background:#f4f6f8;border-radius:10px}.agency-v2 .av-original blockquote{margin:7px 0 0;color:#414952;font-size:16px;line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}.agency-v2 .av-message-main{padding:0 30px 2px}.agency-v2 .av-message-main details{border-top:0!important}.agency-v2 .av-message-main summary{padding-top:0!important}@media(max-width:600px){.agency-v2 .av-original{margin:0 20px 16px;padding:14px}.agency-v2 .av-message-main{padding:0 20px 2px}}
@media(max-width:600px){.agency-v2{border-radius:12px}.agency-v2 .av-head{padding:22px 20px 18px}.agency-v2 h1{font-size:29px}.agency-v2 .av-lead{font-size:16px}.agency-v2 .av-visual{margin:0 16px 16px}.agency-v2 .av-proof{padding:14px 20px}.agency-v2 .av-result{padding:16px 20px;display:block}.agency-v2 .av-result p{margin-top:5px}.agency-v2 .av-details{padding:0 20px 14px}.agency-v2 .av-actions{padding:16px 20px;flex-direction:column}.agency-v2 .av-actions button{width:100%}.agency-v2 .av-video{padding:0 12px 16px}.agency-v2 pre{font-size:13px!important}.agency-v2 .av-message{padding:13px 14px;font-size:16px}.agency-v2 .av-checks{flex-basis:100%}.agency-v2 .av-statline{gap:16px}}
.agency-v2 .av-kicker,.agency-v2 .av-label,.agency-v2 .av-statline span{font-size:14px}
`;

// Two comparison lanes. Mobile is authored separately; essential labels never shrink with a desktop SVG.
export function comparisonSvg(spec, mobile = false) {
  const count=Math.max(spec.before.length,spec.after.length);
  const boxHeight=mobile ? 42+count*29 : 53+count*39;
  const w = mobile ? 360 : 860; const h = mobile ? boxHeight*2+45 : boxHeight;
  const afterFill=spec.pending?'#fff7e6':'#eaf7f0';
  const afterInk=spec.pending?'#925812':'#126748';
  const text = (x,y,s,size=mobile?18:23,fill='#17191c',weight=500) => `<text x="${x}" y="${y}" fill="${fill}" font-family="Arial,Helvetica,sans-serif" font-size="${size}" font-weight="${weight}">${escapeHtml(s)}</text>`;
  const label=(x,y,s,fill)=>text(x,y,s,16,fill,700);
  const box = (x,y,bw,bh,fill) => `<rect x="${x}" y="${y}" width="${bw}" height="${bh}" rx="10" fill="${fill}"/>`;
  let content='';
  if(mobile){
    content+=box(0,0,360,boxHeight,'#fff0ed')+label(18,25,spec.beforeLabel||'BEFORE','#a5392b');
    spec.before.forEach((s,i)=>content+=text(18,60+i*29,s,19,i===0?'#17191c':'#a5392b',i===0?600:500));
    content+=`<path d="M180 ${boxHeight+9}v24m-6-6 6 6 6-6" stroke="#8d969f" stroke-width="2" fill="none"/>`;
    content+=box(0,boxHeight+45,360,boxHeight,afterFill)+label(18,boxHeight+70,spec.afterLabel||'AFTER',afterInk);
    spec.after.forEach((s,i)=>content+=text(18,boxHeight+105+i*29,s,19,i===0?'#17191c':afterInk,i===0?600:500));
  }else{
    content+=box(0,0,398,boxHeight,'#fff0ed')+label(24,32,spec.beforeLabel||'BEFORE','#a5392b');
    spec.before.forEach((s,i)=>content+=text(24,83+i*39,s,25,i===0?'#17191c':'#a5392b',i===0?600:500));
    content+=`<path d="M415 ${boxHeight/2}h30m-7-7 7 7-7 7" stroke="#8d969f" stroke-width="2" fill="none"/>`;
    content+=box(462,0,398,boxHeight,afterFill)+label(486,32,spec.afterLabel||'AFTER',afterInk);
    spec.after.forEach((s,i)=>content+=text(486,83+i*39,s,25,i===0?'#17191c':afterInk,i===0?600:500));
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}" role="img"><title>${escapeHtml(spec.alt)}</title>${content}</svg>`;
}

export function renderCard({source, spec, assetBase}) {
  const actions=actionsFrom(source.card_html||source.cardHtml).map(a=>spec.actionLabel&&/data-radar-action=["']do["']/.test(a)?a.replace(/(>)[\s\S]*?(<\/button>)$/,`$1${escapeHtml(spec.actionLabel)}$2`):a);
  if(!actions.some(a=>/data-radar-action=["']do["']/.test(a))) throw new Error('Missing exact action');
  const sourceDetails=detailsFrom(source.card_html||source.cardHtml).map(s=>s.replace(/(<details\b[^>]*?)\sopen(?:=["'][^"']*["'])?(?=[\s>])/gi,'$1'));
  const summaryOf=s=>s.match(/<summary\b[^>]*>([\s\S]*?)<\/summary>/i)?.[1].replace(/<[^>]*>/g,'').trim();
  if(spec.message && (!spec.replacedMessageSummary || sourceDetails.filter(s=>summaryOf(s)===spec.replacedMessageSummary).length!==1))throw new Error('Exact message replacement must match one source panel');
  const details=spec.message ? `<details open><summary>Read exact ${escapeHtml(spec.messageKind||'reply')} · ${escapeHtml(spec.recipient)}</summary><blockquote class="av-message">${escapeHtml(spec.message)}</blockquote></details>` : sourceDetails.join('');
  // Replace only an explicitly identified message panel. A heading containing
  // "exact" may instead hold source checks or the full diff and must survive.
  const oldProof=spec.message ? sourceDetails.filter(s=>{
    return summaryOf(s)!==spec.replacedMessageSummary;
  }).join('') : '';
  const query=spec.assetRevision?`?v=${spec.assetRevision}`:'';
  const originalBody=`<blockquote>${escapeHtml(spec.original||'')}</blockquote>`;
  const original=spec.originalCollapsed?`<details><summary>Read full original · ${escapeHtml(spec.originalLabel||'source')}</summary>${originalBody}</details>`:`<span class="av-label">${escapeHtml(spec.originalLabel||'Their message')}</span>${originalBody}`;
  const media=spec.original ? `<section class="av-original">${original}</section>` : spec.video ? `<div class="av-video"><video controls preload="metadata" playsinline poster="${escapeHtml(spec.poster)}"><source src="${escapeHtml(spec.video)}" type="video/mp4"></video><div class="av-statline">${spec.stats.map(([n,l])=>`<div><b>${escapeHtml(n)}</b><span>${escapeHtml(l)}</span></div>`).join('')}</div></div>` : `<figure class="av-visual"><picture><source media="(max-width:600px)" srcset="${assetBase}-mobile.svg${query}"><img src="${assetBase}-desktop.svg${query}" alt="${escapeHtml(spec.diagram.alt)}"></picture>${spec.same?`<figcaption>${escapeHtml(spec.same)}</figcaption>`:''}</figure>`;
  return `<style>${cardCss}</style><article class="agency-v2" data-agency-design="2"><header class="av-head"><div class="av-kicker"><span>${escapeHtml(source.project)}</span><span>${escapeHtml(spec.kind)}</span></div><h1>${escapeHtml(spec.headline||source.headline)}</h1><p class="av-lead">${escapeHtml(spec.problem)}</p><div class="av-who"><span class="av-label">Who</span><span>${escapeHtml(spec.who)}</span></div></header>${media}${spec.messageFirst?`<div class="av-message-main">${details}</div>`:''}<section class="av-proof"><span class="av-label">Trust</span><div class="av-checks">${spec.checks.map(s=>`<span class="av-check">${escapeHtml(s)}</span>`).join('')}${spec.gaps.map(s=>`<span class="av-gap">${escapeHtml(s)}</span>`).join('')}</div></section><section class="av-result"><span class="av-label">For you</span><p>${escapeHtml(spec.forYou)}</p></section><div class="av-details">${spec.messageFirst?'':details}${oldProof}${spec.extra||''}</div><footer class="av-actions">${actions.join('')}</footer></article>`;
}

// Host presentation only. Stored card HTML and approval instructions stay intact.
export const cardPresentation = `
:host{display:block;color:var(--ink);font-family:var(--font);color-scheme:inherit}
*{box-sizing:border-box}
main,article{width:100%;max-width:80ch!important;margin-inline:auto!important;padding:24px!important;background:transparent!important;color:var(--ink)!important;font-family:var(--font)!important}
h1{font-family:var(--font)!important;font-size:clamp(25px,4vw,34px)!important;line-height:1.16!important;font-weight:650!important;letter-spacing:-.035em!important;margin:8px 0 18px!important;text-wrap:balance}
h2,h3{font-family:var(--font)!important;line-height:1.3}
p,li{line-height:1.6}
img,picture,video{max-width:100%;height:auto}
pre{white-space:pre-wrap!important;overflow-wrap:anywhere;max-width:100%}
table{max-width:100%}
button,summary{touch-action:manipulation}
summary{min-height:44px;padding-block:10px}
[data-radar-action]{min-height:44px;max-width:100%;white-space:normal;font-family:var(--font)!important;font-size:16px!important;cursor:pointer}
[data-radar-action="do"]{border:0!important;border-radius:10px!important;background:var(--action)!important;color:var(--on-action)!important;font-weight:650!important;padding:14px 18px!important;line-height:1.4!important}
[data-radar-action="open"]{display:inline-flex!important;align-items:center;gap:.4em;background:transparent!important;color:var(--accent)!important;border-color:var(--line-2)!important;padding:10px 12px!important;font-size:14px!important}
[data-radar-action]:focus-visible,summary:focus-visible{outline:3px solid var(--focus)!important;outline-offset:3px}
:is(.eyebrow,.path,.source,.foot){color:var(--ink-2)!important;letter-spacing:normal!important;text-transform:none!important;font-size:13px!important}
:host([data-theme="dark"]) :is(h1,h2,h3,p,li,summary,blockquote,.lede,.scope,.small,.doc,.copy,.note){color:var(--ink)!important}
:host([data-theme="dark"]) :is(pre,.copy,.note,.graphic,.hero,.panel){background:var(--panel-2)!important;color:var(--ink)!important;border-color:var(--line-2)!important}
:host([data-theme="dark"]) [data-agency-surface]{background:var(--panel-2)!important;color:var(--ink)!important;border-color:var(--line-2)!important}
:host([data-theme="dark"]) [data-agency-surface] :not([data-radar-action]){color:inherit!important}
:host([data-theme="dark"]) :is(.hero,.graphic) :is(strong,b,small,span,div){color:inherit!important}
:host([data-theme="dark"]) :is(details,td,th,blockquote){border-color:var(--line-2)!important}
:host([data-theme="dark"]) mark{background:#695623;color:#fff2be}
@media(max-width:600px){main,article{padding:20px 18px!important}h1{font-size:27px!important}p,li{font-size:16px}.hero,.graphic{margin-block:20px!important}pre{font-size:13px!important}}
@media(prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important;scroll-behavior:auto!important}}
`;

export function applyCardPresentation(root: ShadowRoot) {
  // Legacy cards can have hard-coded surfaces under any class name. Identify
  // those before applying our theme, then change their foreground/background
  // together. Leave image assets and their original colors alone.
  root.querySelectorAll<HTMLElement>("main,article,section,div,aside,header,footer,blockquote,details,figure,figcaption,p,span,li,td,th,pre,code").forEach((element) => {
    const style = getComputedStyle(element);
    const background = style.backgroundColor;
    const hasColor = background !== "transparent" && !/^rgba\([^)]*,\s*0\)$/.test(background);
    if (hasColor || style.backgroundImage.includes("gradient(")) element.setAttribute("data-agency-surface", "");
  });
  const style = document.createElement("style");
  style.textContent = cardPresentation;
  root.append(style);
}

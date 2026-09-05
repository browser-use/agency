// Normalize authored copy, not the source material used to prove a card.
const LONG_DASH = /[\u2013\u2014]|&(?:mdash|ndash|#0*821[12]|#x0*201[34]);/gi;

export function shortDashes(text: string): string {
  // URLs and literal code are evidence, even inside an otherwise prose field.
  return text.replace(/```[\s\S]*?```|`[^`\n]*`|https?:\/\/[^\s<>"']+|([^`]+)/g, (part) => {
    if (part.startsWith("`") || /^https?:\/\//.test(part)) return part;
    // A prose segment can itself contain URLs.
    return part.split(/(https?:\/\/[^\s<>"']+)/g)
      .map((piece: string) => /^https?:\/\//.test(piece) ? piece : piece.replace(LONG_DASH, "-"))
      .join("");
  });
}

export function shortDashesHtml(html: string): string {
  const saved: string[] = [];
  let marker = "RADAR_PRESERVED_DASH_";
  while (html.includes(marker)) marker += "_";
  const preserve = (value: string) => `${marker}${saved.push(value) - 1}_END`;
  // Keep literal code, quoted sources, and their formatting byte-for-byte.
  let output = html.replace(/<(style|script|code|kbd|samp|cite)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, preserve);
  output = output.replace(/<blockquote\b([^>]*)>[\s\S]*?<\/blockquote\s*>/gi,
    (block, attrs: string) => /\b(?:draft|message|reply|email|mail|exact)\b/i.test(attrs) ? block : preserve(block));
  output = output.replace(/<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary>[\s\S]*?<\/details\s*>/gi,
    (section, summary: string) => /\b(original|previous|prior|public trigger|source quote|sent message)\b/i.test(summary) ? preserve(section) : section);
  output = output.replace(/<pre\b([^>]*)>[\s\S]*?<\/pre\s*>/gi, (block, attrs: string) => {
    const prose = /\b(?:draft|message|reply|email|mail|exact)\b/i.test(attrs);
    const diff = /\b(?:diff|patch|language-|code)\b/i.test(attrs)
      || /class\s*=\s*["'][^"']*\b(?:add|del|ctx)\b|diff --git/i.test(block);
    return prose && !diff ? block : preserve(block);
  });
  output = output.replace(/<[^>"']*(?:(?:"[^"]*"|'[^']*')[^>"']*)*>|[^<]+/g, (part) => {
    if (!part.startsWith("<")) return shortDashes(part);
    return part.replace(/(\b(?:alt|title|aria-label|data-radar-prompt|data-radar-label)\s*=\s*)(["'])([\s\S]*?)\2/gi,
      (_attribute, prefix: string, quote: string, value: string) => `${prefix}${quote}${shortDashes(value)}${quote}`);
  });
  // Protected sections may contain placeholders for protected child elements.
  for (let index = saved.length - 1; index >= 0; index--) output = output.replaceAll(`${marker}${index}_END`, saved[index]);
  return output;
}

const PROTECTED_KEY = /(?:url|uri|path|sha|hash|dedupe|diff|patch|command|code|stdout|stderr|raw|original|previous|prior|history|evidence|source|quote|user.?feedback|note)/i;

export function shortDashesContext(value: unknown): unknown {
  if (typeof value === "string") return shortDashes(value);
  if (Array.isArray(value)) return value.map(shortDashesContext);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, item]) => {
    if (PROTECTED_KEY.test(key)) return [key, item];
    if (/^card_?html$/i.test(key) && typeof item === "string") return [key, shortDashesHtml(item)];
    if (/^agent_?context$/i.test(key) && typeof item === "string") return [key, shortDashesStoredContext(item)];
    return [key, shortDashesContext(item)];
  }));
}

export function shortDashesStoredContext(text: string): string {
  try {
    const parsed: unknown = JSON.parse(text);
    const normalized = shortDashesContext(parsed);
    return JSON.stringify(parsed) === JSON.stringify(normalized) ? text : JSON.stringify(normalized);
  } catch {
    return shortDashes(text);
  }
}

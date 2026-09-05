export type DecisionKind = "pr" | "message" | "visual" | "task";

export type DecisionCardInput = {
  headline?: string | null;
  category?: string | null;
  sourceLabel?: string | null;
  cardHtml?: string | null;
  agentContext?: string | null;
  decisionEstimateMs?: number | null;
  decisionEstimateReason?: string | null;
};

export type DecisionEstimate = {
  kind: DecisionKind;
  baselineMs: number;
  estimatedMs: number;
  reason: string;
  learnedFactor: number;
};

export type DecisionSample = DecisionCardInput & {
  activeMs: number | null;
};

export type DecisionTimeModel = Record<DecisionKind, { factor: number; samples: number }>;

const MIN_ESTIMATE_MS = 5_000;
const MAX_ESTIMATE_MS = 3 * 60_000;
const EMPTY_MODEL: DecisionTimeModel = {
  pr: { factor: 1, samples: 0 },
  message: { factor: 1, samples: 0 },
  visual: { factor: 1, samples: 0 },
  task: { factor: 1, samples: 0 },
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundSeconds(milliseconds: number) {
  return Math.round(milliseconds / 1_000) * 1_000;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = values.toSorted((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function safeContext(value: string | null | undefined) {
  if (!value) return {} as Record<string, unknown>;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
  } catch {
    return {} as Record<string, unknown>;
  }
}

function contextString(context: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = context[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function plainText(html: string) {
  return html
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(?:nbsp|amp|lt|gt|quot|#\d+);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function wordCount(value: string) {
  return value.trim() ? value.trim().split(/\s+/).length : 0;
}

function classify(card: DecisionCardInput): DecisionKind {
  const subject = `${card.headline ?? ""} ${card.category ?? ""} ${card.sourceLabel ?? ""} ${card.cardHtml ?? ""}`.toLowerCase();
  if (/\bmerge\s+(?:this\s+)?pr\b|\bpull request\b|\bpr\s*#\d+\b/.test(subject)) return "pr";
  if (/\b(reply|message|email|outreach|dm|post|tweet|linkedin|slack)\b/.test(subject)) return "message";
  if (/\b(video|demo|reel|recording|visual|design|image|graphic|screenshot)\b/.test(subject)) return "visual";
  return "task";
}

function diffStats(html: string) {
  const lines = html.split("\n");
  const changedLines = lines.filter((line) => /^\+(?!\+\+)/.test(line) || /^-(?!--)/.test(line)).length;
  const diffFiles = (html.match(/diff --git /g) ?? []).length;
  const summary = html.match(/(\d+)\s+files?.{0,30}\+(\d+).{0,12}[−-](\d+)/i);
  return {
    files: diffFiles || Number(summary?.[1] ?? 0),
    lines: changedLines || Number(summary?.[2] ?? 0) + Number(summary?.[3] ?? 0),
  };
}

function explicitEstimate(card: DecisionCardInput, context: Record<string, unknown>) {
  const stored = Number(card.decisionEstimateMs ?? 0);
  if (Number.isFinite(stored) && stored > 0) return stored;
  for (const key of ["effortSeconds", "decisionEstimateSeconds", "decisionTimeEstimateSeconds", "reviewEstimateSeconds"]) {
    const seconds = Number(context[key] ?? 0);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1_000;
  }
  return 0;
}

export function estimateDecisionTime(card: DecisionCardInput): Omit<DecisionEstimate, "learnedFactor"> {
  const html = card.cardHtml ?? "";
  const context = safeContext(card.agentContext);
  const kind = classify(card);
  const explicit = explicitEstimate(card, context);
  const explicitReason = card.decisionEstimateReason?.trim()
    || contextString(context, ["effortReason", "decisionEstimateReason", "decisionTimeEstimateReason", "reviewEstimateReason"]);
  const expandable = /<details\b/i.test(html);
  const inlineCode = /<(?:pre|code)\b|diff --git |data-diff-kind=/i.test(html);
  const colorCodedDiff = /data-diff-kind=|class\s*=\s*["'][^"']*\b(?:diff-add|diff-del|diff-insert|diff-remove|added|removed)\b/i.test(html);
  const inlineGraphic = /<(?:img|figure|video|canvas|meter|progress|table)\b/i.test(html);
  const opensElsewhere = /data-radar-action\s*=\s*["']open["']/i.test(html);

  if (explicit) {
    // Heuristic bounds must not shorten an explicit human review estimate.
    const baselineMs = Math.max(1_000, roundSeconds(explicit));
    return { kind, baselineMs, estimatedMs: baselineMs, reason: explicitReason || "card estimate" };
  }

  if (kind === "pr") {
    const stats = diffStats(html);
    const raw = stats.lines
      ? 7_000 + stats.files * 1_200 + stats.lines * 160
      : 18_000 + Math.min(60_000, html.length * 4);
    const presentationFactor = (inlineCode ? 0.88 : opensElsewhere ? 1.25 : 1)
      * (expandable ? 0.9 : 1)
      * (colorCodedDiff ? 0.88 : 1);
    const baselineMs = roundSeconds(clamp(raw * presentationFactor, MIN_ESTIMATE_MS, MAX_ESTIMATE_MS));
    const scope = stats.lines
      ? `${stats.files || 1} ${stats.files === 1 ? "file" : "files"} · ${stats.lines} changed lines`
      : "PR scope estimate";
    const presentation = [expandable && "expandable", colorCodedDiff && "color-coded", inlineCode && "inline diff"].filter(Boolean).join(" ");
    const reason = `${scope}${presentation ? ` · ${presentation}` : opensElsewhere ? " · external review" : ""}`;
    return { kind, baselineMs, estimatedMs: baselineMs, reason };
  }

  if (kind === "message") {
    const exact = contextString(context, ["exactReply", "exactMessage", "exactPost", "exactDraft", "draft", "copy"]);
    const words = wordCount(exact || plainText(html));
    const presentationFactor = expandable ? 0.8 : opensElsewhere ? 1.25 : 1;
    const baselineMs = roundSeconds(clamp((4_500 + Math.min(25_000, words * 220)) * presentationFactor, MIN_ESTIMATE_MS, 35_000));
    const presentation = expandable ? " · expandable inline copy" : opensElsewhere ? " · opens elsewhere" : "";
    return { kind, baselineMs, estimatedMs: baselineMs, reason: `${words || "short"} word message${presentation}` };
  }

  if (kind === "visual") {
    const duration = Number(`${card.headline ?? ""} ${card.category ?? ""} ${html}`.match(/(\d{1,3})\s*(?:s|sec|second)/i)?.[1] ?? 0);
    const presentationFactor = inlineGraphic ? 0.85 : opensElsewhere ? 1.2 : 1;
    const baselineMs = roundSeconds(clamp((12_000 + Math.min(45_000, duration * 700)) * presentationFactor, MIN_ESTIMATE_MS, 60_000));
    return { kind, baselineMs, estimatedMs: baselineMs, reason: `${duration ? `${duration}s visual` : "visual check"}${inlineGraphic ? " · shown inline" : opensElsewhere ? " · opens elsewhere" : ""}` };
  }

  const words = wordCount(plainText(html));
  const presentationFactor = (expandable ? 0.9 : 1) * (inlineGraphic ? 0.9 : 1) * (opensElsewhere && !expandable && !inlineGraphic ? 1.15 : 1);
  const baselineMs = roundSeconds(clamp((8_000 + Math.min(30_000, words * 90)) * presentationFactor, MIN_ESTIMATE_MS, 45_000));
  const presentation = [expandable && "expandable proof", inlineGraphic && "inline visual"].filter(Boolean).join(" · ");
  return { kind, baselineMs, estimatedMs: baselineMs, reason: presentation || (opensElsewhere ? "external review" : "card review") };
}

export function buildDecisionTimeModel(samples: DecisionSample[]): DecisionTimeModel {
  const ratios: Record<DecisionKind, number[]> = { pr: [], message: [], visual: [], task: [] };
  for (const sample of samples) {
    const activeMs = Number(sample.activeMs ?? 0);
    if (!Number.isFinite(activeMs) || activeMs < 1_000 || activeMs > 10 * 60_000) continue;
    const estimate = estimateDecisionTime(sample);
    ratios[estimate.kind].push(activeMs / estimate.baselineMs);
  }

  return Object.fromEntries((Object.keys(EMPTY_MODEL) as DecisionKind[]).map((kind) => {
    const values = ratios[kind];
    const observed = median(values);
    if (observed === null || values.length < 3) return [kind, { factor: 1, samples: values.length }];
    // Let observed decision times exceed the naive baselines while shrinking
    // sparse samples toward the neutral starting factor.
    const weight = values.length / (values.length + 8);
    const factor = 1 + (clamp(observed, 0.5, 5) - 1) * weight;
    return [kind, { factor, samples: values.length }];
  })) as DecisionTimeModel;
}

export function calibratedDecisionTime(card: DecisionCardInput, model: DecisionTimeModel = EMPTY_MODEL): DecisionEstimate {
  const baseline = estimateDecisionTime(card);
  // An agent's own effort guess is calibrated too: history shows agents underestimate as much as the
  // baselines do. An explicit estimate keeps its own scale (a stated 30-minute review is not capped).
  const learned = model[baseline.kind] ?? EMPTY_MODEL[baseline.kind];
  const explicit = explicitEstimate(card, safeContext(card.agentContext));
  const scaled = baseline.baselineMs * learned.factor;
  return {
    ...baseline,
    estimatedMs: roundSeconds(explicit ? Math.max(MIN_ESTIMATE_MS, scaled) : clamp(scaled, MIN_ESTIMATE_MS, MAX_ESTIMATE_MS)),
    learnedFactor: learned.factor,
  };
}

export type CardCluster = "growth" | "support" | "fix" | "product";

export const CLUSTERS: Array<{ id: CardCluster; label: string; hint: string }> = [
  { id: "growth", label: "Growth", hint: "posts, replies, outreach, integrations" },
  { id: "support", label: "Support", hint: "customer and ticket replies" },
  { id: "fix", label: "Fixes", hint: "PRs, bugs, reliability, speed" },
  { id: "product", label: "Product", hint: "features, decisions, stats, Agency" },
];

const RULES: Array<[CardCluster, RegExp]> = [
  ["support", /\b(support|pylon|customer|refund|billing|churn|outreach|onboarding|ticket|priority customer|named customer|wajo|mable|bisin|nous)\b/i],
  ["fix", /\b(fix|bug|reliab|regression|merge|pr\b|pull request|observab|logging|alert|installer|docker|restart|keyboard|recording integrity|performance|startup|handoff|warm workspace|run result|security|oss|contributor|conflict|blocked)\b/i],
  ["growth", /\b(growth|distribution|x reply|x post|reddit|quote|social|case study|demo|launch|hackathon|integration|hype|press|newsletter|community|mention|linkedin|hn|show hn|awesome|template|default)\b/i],
  ["product", /\b(product|pitch|feature|decision|stats|agency|pricing|roadmap|analytics|usage|scaling user|what to build|design)\b/i],
];

/** Coarse cluster for the left-panel filter. Category words win, then project and headline. */
export function clusterForCard(card: { category?: string | null; project?: string | null; headline?: string | null }): CardCluster {
  const category = (card.category ?? "").trim();
  const first = category.split(/[·:|/-]/)[0]?.trim().toLowerCase() ?? "";
  if (first === "growth" || first === "distribution") return "growth";
  if (first === "support" || first === "customer support" || first === "named customer" || first === "priority customer" || first === "support ops") return "support";
  if (first === "fix" || first === "fixes" || first === "reliability" || first === "oss") return "fix";
  if (first === "product" || first === "agency") return "product";
  const text = `${category} ${card.project ?? ""} ${card.headline ?? ""}`;
  for (const [cluster, pattern] of RULES) if (pattern.test(text)) return cluster;
  return "product";
}

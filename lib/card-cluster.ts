export type Topic = { id: string; label: string; hint: string; keywords: string[] };

/** The four topics the app started with. The live list comes from the topics table and may differ. */
export const DEFAULT_TOPICS: Topic[] = [
  { id: "growth", label: "Growth", hint: "posts, replies, outreach, integrations", keywords: ["growth", "distribution", "x reply", "x post", "reddit", "quote", "social", "case study", "demo", "launch", "hackathon", "integration", "hype", "press", "newsletter", "community", "mention", "linkedin", "hn", "show hn", "awesome", "template", "default"] },
  { id: "support", label: "Support", hint: "customer and ticket replies", keywords: ["support", "pylon", "customer", "refund", "billing", "churn", "outreach", "onboarding", "ticket", "priority customer", "named customer", "customer support", "support ops"] },
  { id: "fix", label: "Fixes", hint: "PRs, bugs, reliability, speed", keywords: ["fix", "fixes", "bug", "reliab", "reliability", "regression", "merge", "pr", "pull request", "observab", "logging", "alert", "installer", "docker", "restart", "performance", "startup", "handoff", "security", "oss", "contributor", "conflict", "blocked"] },
  { id: "product", label: "Product", hint: "features, decisions, stats, Agency", keywords: ["product", "pitch", "feature", "decision", "stats", "agency", "pricing", "roadmap", "analytics", "usage", "scaling user", "what to build", "design"] },
];

/** Backwards-compatible aliases so older categories still land somewhere sensible. */
export const CLUSTERS = DEFAULT_TOPICS;
export type CardCluster = string;

export function parseTopicRow(row: { id: string; label: string; hint?: string | null; keywords?: string | null }): Topic {
  return { id: row.id, label: row.label, hint: row.hint ?? "", keywords: (row.keywords ?? "").split(",").map((k) => k.trim().toLowerCase()).filter(Boolean) };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Which topic a card belongs to. The category's first segment wins when it names a topic
 * (by id, label, or a keyword); otherwise the first topic whose keyword appears in the
 * category, project, or headline; otherwise "" (unfiled, shown only under All).
 */
export function clusterForCard(card: { category?: string | null; project?: string | null; headline?: string | null }, topics: Topic[] = DEFAULT_TOPICS): string {
  const category = (card.category ?? "").trim();
  const first = category.split(/[·:|/-]/)[0]?.trim().toLowerCase() ?? "";
  for (const topic of topics) {
    if (first === topic.id || first === topic.label.toLowerCase() || topic.keywords.includes(first)) return topic.id;
  }
  const text = `${category} ${card.project ?? ""} ${card.headline ?? ""}`.toLowerCase();
  for (const topic of topics) {
    for (const keyword of topic.keywords) {
      if (new RegExp(`\\b${escapeRegExp(keyword)}\\b`, "i").test(text)) return topic.id;
    }
  }
  return "";
}

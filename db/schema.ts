import { sql } from "drizzle-orm";
import { integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const contexts = sqliteTable("contexts", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  text: text("text").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const ideas = sqliteTable("ideas", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  project: text("project").notNull().default("Browser Use"),
  category: text("category").notNull().default("Distribution"),
  headline: text("headline").notNull(),
  whyMatters: text("why_matters").notNull(),
  impact: text("impact").notNull(),
  finishedWork: text("finished_work").notNull(),
  primaryAction: text("primary_action").notNull(),
  secondaryAction: text("secondary_action").notNull().default("See proof"),
  cardHtml: text("card_html").notNull().default(""),
  agentContext: text("agent_context").notNull().default("{}"),
  externalAction: text("external_action").notNull(),
  score: integer("score").notNull(),
  riseReach: integer("rise_reach").notNull().default(0),
  riseImpact: integer("rise_impact").notNull().default(0),
  riseStrategicFit: integer("rise_strategic_fit").notNull().default(0),
  riseEase: integer("rise_ease").notNull().default(0),
  decisionEstimateMs: integer("decision_estimate_ms").notNull().default(0),
  decisionEstimateReason: text("decision_estimate_reason").notNull().default(""),
  version: integer("version").notNull().default(1),
  sourceLabel: text("source_label").notNull(),
  sourceUrl: text("source_url").notNull(),
  agentName: text("agent_name").notNull(),
  previewKind: text("preview_kind").notNull(),
  previewTitle: text("preview_title").notNull(),
  previewBody: text("preview_body").notNull(),
  previewAsset: text("preview_asset").notNull().default(""),
  dedupeKey: text("dedupe_key").notNull(),
  status: text("status").notNull().default("new"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("idx_ideas_dedupe_key").on(table.dedupeKey)]);

export const feedback = sqliteTable("feedback", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ideaId: integer("idea_id").notNull(),
  decision: text("decision").notNull(),
  note: text("note").notNull().default(""),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const agentJobs = sqliteTable("agent_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ideaId: integer("idea_id").notNull(),
  action: text("action").notNull(),
  buttonLabel: text("button_label").notNull(),
  instruction: text("instruction").notNull().default(""),
  userFeedback: text("user_feedback").notNull().default(""),
  cardContext: text("card_context").notNull(),
  status: text("status").notNull().default("queued"),
  result: text("result").notNull().default(""),
  ticketOutcome: text("ticket_outcome"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const cardAttention = sqliteTable("card_attention", {
  ideaId: integer("idea_id").notNull(),
  ideaVersion: integer("idea_version").notNull(),
  firstSeenAt: text("first_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  lastSeenAt: text("last_seen_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  activeMs: integer("active_ms").notNull().default(0),
  viewCount: integer("view_count").notNull().default(0),
  decisionAction: text("decision_action"),
  decisionLabel: text("decision_label").notNull().default(""),
  decisionSource: text("decision_source").notNull().default("user"),
  decidedAt: text("decided_at"),
  wallMs: integer("wall_ms"),
}, (table) => [primaryKey({ columns: [table.ideaId, table.ideaVersion] })]);

export const cardInteractions = sqliteTable("card_interactions", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  ideaId: integer("idea_id").notNull(),
  ideaVersion: integer("idea_version").notNull(),
  action: text("action").notNull(),
  label: text("label").notNull().default(""),
  activeMs: integer("active_ms").notNull().default(0),
  wallMs: integer("wall_ms").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

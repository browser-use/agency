CREATE TABLE `card_interactions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`idea_id` integer NOT NULL,
	`idea_version` integer NOT NULL,
	`action` text NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`active_ms` integer DEFAULT 0 NOT NULL,
	`wall_ms` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `card_attention` ADD `decision_source` text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE `ideas` ADD `decision_estimate_ms` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `ideas` ADD `decision_estimate_reason` text DEFAULT '' NOT NULL;
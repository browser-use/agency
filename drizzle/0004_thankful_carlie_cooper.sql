CREATE TABLE `card_attention` (
	`idea_id` integer NOT NULL,
	`idea_version` integer NOT NULL,
	`first_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`last_seen_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`active_ms` integer DEFAULT 0 NOT NULL,
	`view_count` integer DEFAULT 0 NOT NULL,
	`decision_action` text,
	`decision_label` text DEFAULT '' NOT NULL,
	`decided_at` text,
	`wall_ms` integer,
	PRIMARY KEY(`idea_id`, `idea_version`)
);
--> statement-breakpoint
ALTER TABLE `ideas` ADD `version` integer DEFAULT 1 NOT NULL;

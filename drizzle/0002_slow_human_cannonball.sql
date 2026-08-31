CREATE TABLE `agent_jobs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`idea_id` integer NOT NULL,
	`action` text NOT NULL,
	`button_label` text NOT NULL,
	`instruction` text DEFAULT '' NOT NULL,
	`user_feedback` text DEFAULT '' NOT NULL,
	`card_context` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`result` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
ALTER TABLE `ideas` ADD `card_html` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `ideas` ADD `agent_context` text DEFAULT '{}' NOT NULL;
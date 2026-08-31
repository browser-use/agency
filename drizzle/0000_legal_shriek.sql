CREATE TABLE `contexts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`text` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`idea_id` integer NOT NULL,
	`decision` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `ideas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`headline` text NOT NULL,
	`why_matters` text NOT NULL,
	`impact` text NOT NULL,
	`finished_work` text NOT NULL,
	`primary_action` text NOT NULL,
	`external_action` text NOT NULL,
	`score` integer NOT NULL,
	`source_label` text NOT NULL,
	`source_url` text NOT NULL,
	`agent_name` text NOT NULL,
	`preview_kind` text NOT NULL,
	`preview_title` text NOT NULL,
	`preview_body` text NOT NULL,
	`preview_asset` text DEFAULT '' NOT NULL,
	`dedupe_key` text NOT NULL,
	`status` text DEFAULT 'new' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_ideas_dedupe_key` ON `ideas` (`dedupe_key`);
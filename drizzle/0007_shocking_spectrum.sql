CREATE TABLE `agent_settings` (
	`id` integer PRIMARY KEY NOT NULL,
	`revision` integer DEFAULT 0 NOT NULL,
	`models` text DEFAULT '[]' NOT NULL,
	`runner_default` text,
	`discovery` text,
	`execution` text
);
--> statement-breakpoint
INSERT OR IGNORE INTO `agent_settings` (`id`) VALUES (1);
--> statement-breakpoint
ALTER TABLE `agent_jobs` ADD `agent_config` text;--> statement-breakpoint
ALTER TABLE `agent_jobs` ADD `agent_run` text;--> statement-breakpoint
ALTER TABLE `ideas` ADD `agent_selection` text;--> statement-breakpoint
ALTER TABLE `ideas` ADD `agent_revision` integer DEFAULT 0 NOT NULL;

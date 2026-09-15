CREATE TABLE `projects` (
	`id` text PRIMARY KEY NOT NULL,
	`label` text NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `topics` (
	`project_id` text DEFAULT 'default' NOT NULL,
	`id` text NOT NULL,
	`label` text NOT NULL,
	`hint` text DEFAULT '' NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`project_id`, `id`)
);
--> statement-breakpoint
ALTER TABLE `contexts` ADD `project_id` text DEFAULT 'default' NOT NULL;--> statement-breakpoint
ALTER TABLE `ideas` ADD `project_id` text DEFAULT 'default' NOT NULL;
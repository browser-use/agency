ALTER TABLE `ideas` ADD `project` text DEFAULT 'Browser Use' NOT NULL;--> statement-breakpoint
ALTER TABLE `ideas` ADD `category` text DEFAULT 'Distribution' NOT NULL;--> statement-breakpoint
ALTER TABLE `ideas` ADD `secondary_action` text DEFAULT 'See proof' NOT NULL;
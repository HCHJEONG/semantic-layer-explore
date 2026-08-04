CREATE TABLE `rules` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`condition_json` text NOT NULL,
	`action_json` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`cooldown_seconds` integer DEFAULT 10 NOT NULL,
	`last_triggered_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_rules_enabled` ON `rules` (`enabled`);
--> statement-breakpoint
PRAGMA optimize;

CREATE TABLE `devices` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`state_json` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`type` text NOT NULL,
	`source_type` text NOT NULL,
	`source_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`occurred_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_event_id_unique` ON `events` (`event_id`);--> statement-breakpoint
CREATE TABLE `sensor_readings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` text NOT NULL,
	`sensor_id` text NOT NULL,
	`value_json` text NOT NULL,
	`measured_at` text NOT NULL,
	`source` text NOT NULL,
	FOREIGN KEY (`sensor_id`) REFERENCES `sensors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sensor_readings_event_id_unique` ON `sensor_readings` (`event_id`);--> statement-breakpoint
CREATE TABLE `sensors` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`unit` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sensor_readings_sensor_measured` ON `sensor_readings` (`sensor_id`, `measured_at`);
--> statement-breakpoint
CREATE INDEX `idx_events_occurred_at` ON `events` (`occurred_at`);
--> statement-breakpoint
CREATE INDEX `idx_events_type_occurred` ON `events` (`type`, `occurred_at`);
--> statement-breakpoint
INSERT INTO `sensors` (`id`, `name`, `type`, `unit`, `enabled`, `created_at`) VALUES
  ('temperature-01', 'Temperature Sensor', 'temperature', 'celsius', 1, '2026-08-04T00:00:00.000Z'),
  ('light-01', 'Light Sensor', 'light', 'lux', 1, '2026-08-04T00:00:00.000Z'),
  ('distance-01', 'Distance Sensor', 'distance', 'centimeter', 1, '2026-08-04T00:00:00.000Z'),
  ('button-01', 'Button Sensor', 'button', 'boolean', 1, '2026-08-04T00:00:00.000Z');
--> statement-breakpoint
INSERT INTO `devices` (`id`, `name`, `type`, `state_json`, `enabled`, `updated_at`) VALUES
  ('led-01', 'Workspace LED', 'led', '{"status":"off"}', 1, '2026-08-04T00:00:00.000Z'),
  ('servo-01', 'Workspace Servo', 'servo', '{"status":"off","angle":90}', 1, '2026-08-04T00:00:00.000Z'),
  ('buzzer-01', 'Workspace Buzzer', 'buzzer', '{"status":"off"}', 1, '2026-08-04T00:00:00.000Z'),
  ('relay-fan-01', 'Fan Relay', 'relay', '{"status":"off"}', 1, '2026-08-04T00:00:00.000Z');
--> statement-breakpoint
PRAGMA optimize;

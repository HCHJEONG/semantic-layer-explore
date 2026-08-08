CREATE TABLE `classes` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `classes_name_unique` ON `classes` (`name`);--> statement-breakpoint
CREATE TABLE `individuals` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`class_id` integer NOT NULL,
	`description` text NOT NULL,
	FOREIGN KEY (`class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `individuals_name_unique` ON `individuals` (`name`);--> statement-breakpoint
CREATE TABLE `properties` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`domain_class_id` integer NOT NULL,
	`range_class_id` integer NOT NULL,
	`description` text NOT NULL,
	FOREIGN KEY (`domain_class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`range_class_id`) REFERENCES `classes`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `properties_name_unique` ON `properties` (`name`);--> statement-breakpoint
CREATE TABLE `relations` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`subject_id` integer NOT NULL,
	`property_id` integer NOT NULL,
	`object_id` integer NOT NULL,
	FOREIGN KEY (`subject_id`) REFERENCES `individuals`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`object_id`) REFERENCES `individuals`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_properties_domain_class_id` ON `properties` (`domain_class_id`);
--> statement-breakpoint
CREATE INDEX `idx_individuals_class_id` ON `individuals` (`class_id`);
--> statement-breakpoint
CREATE INDEX `idx_relations_subject_property` ON `relations` (`subject_id`, `property_id`);
--> statement-breakpoint
CREATE INDEX `idx_relations_object_property` ON `relations` (`object_id`, `property_id`);
--> statement-breakpoint
INSERT INTO `classes` (`name`, `description`) VALUES
  ('Person', 'A human actor who can work for a company or participate in a project.'),
  ('Company', 'An organization that can employ people.'),
  ('Project', 'A defined body of work to which people can be assigned.');
--> statement-breakpoint
INSERT INTO `properties` (`name`, `domain_class_id`, `range_class_id`, `description`) VALUES
  ('worksFor', 1, 2, 'Connects a person to the company they work for.'),
  ('assignedTo', 1, 3, 'Connects a person to a project they are assigned to.');
--> statement-breakpoint
INSERT INTO `individuals` (`name`, `class_id`, `description`) VALUES
  ('InspectionTeam', 1, 'An operations team responsible for monitoring the BestAiCom smart workspace.'),
  ('OpsEngineer', 1, 'An engineer assigned to automation review and workspace operations.'),
  ('BestAiCom', 2, 'The company operating the semantic workspace portfolio.'),
  ('BestAiCom Smart Workspace', 3, 'A project that demonstrates semantic operations intelligence.');
--> statement-breakpoint
INSERT INTO `relations` (`subject_id`, `property_id`, `object_id`) VALUES
  (1, 1, 3),
  (2, 1, 3),
  (2, 2, 4);
--> statement-breakpoint
PRAGMA optimize;

ALTER TABLE `classes` RENAME TO `semantic_classes`;
--> statement-breakpoint
ALTER TABLE `properties` RENAME TO `semantic_properties`;
--> statement-breakpoint
ALTER TABLE `individuals` RENAME TO `semantic_individuals`;
--> statement-breakpoint
ALTER TABLE `relations` RENAME TO `semantic_relations`;
--> statement-breakpoint
PRAGMA optimize;

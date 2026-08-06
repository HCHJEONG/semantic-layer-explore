UPDATE `semantic_individuals`
SET `name` = 'InspectionTeam',
    `description` = 'An operations team responsible for monitoring the BestAiCom smart workspace.'
WHERE `name` = 'Alice';
--> statement-breakpoint
UPDATE `semantic_individuals`
SET `name` = 'OpsEngineer',
    `description` = 'An engineer assigned to automation review and workspace operations.'
WHERE `name` = 'Bob';
--> statement-breakpoint
UPDATE `semantic_individuals`
SET `name` = 'BestAiCom',
    `description` = 'The company operating the semantic workspace portfolio.'
WHERE `id` = 3 OR `name` = 'BestAiCom';
--> statement-breakpoint
UPDATE `semantic_individuals`
SET `name` = 'BestAiCom Smart Workspace',
    `description` = 'A project that demonstrates semantic operations intelligence.'
WHERE `name` = 'Semantic Explorer';
--> statement-breakpoint
PRAGMA optimize;

-- Add graph_id column to context_configs (initially nullable)
ALTER TABLE `context_configs` ADD COLUMN `graph_id` text;--> statement-breakpoint

-- Populate graph_id by looking up from agent_graph
UPDATE `context_configs` 
SET `graph_id` = (
  SELECT `agent_graph`.`id` 
  FROM `agent_graph` 
  WHERE `agent_graph`.`context_config_id` = `context_configs`.`id`
    AND `agent_graph`.`tenant_id` = `context_configs`.`tenant_id`
    AND `agent_graph`.`project_id` = `context_configs`.`project_id`
  LIMIT 1
);--> statement-breakpoint

-- Note: Any context_configs not referenced by a graph will have NULL graph_id
-- If you want to handle orphaned configs differently, modify before continuing

-- Now recreate the table with proper constraints
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_context_configs` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`graph_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`request_context_schema` blob,
	`context_variables` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `graph_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`graph_id`) REFERENCES `agent_graph`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

-- Copy data, excluding any rows where graph_id is NULL (orphaned configs)
INSERT INTO `__new_context_configs`("tenant_id", "id", "project_id", "graph_id", "name", "description", "request_context_schema", "context_variables", "created_at", "updated_at") 
SELECT "tenant_id", "id", "project_id", "graph_id", "name", "description", "request_context_schema", "context_variables", "created_at", "updated_at" 
FROM `context_configs`
WHERE `graph_id` IS NOT NULL;--> statement-breakpoint

DROP TABLE `context_configs`;--> statement-breakpoint
ALTER TABLE `__new_context_configs` RENAME TO `context_configs`;--> statement-breakpoint
PRAGMA foreign_keys=ON;

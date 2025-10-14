ALTER TABLE `agent_function_tool_relations` RENAME TO `sub_agent_function_tool_relations`;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sub_agent_function_tool_relations` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`sub_agent_id` text NOT NULL,
	`function_tool_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `agent_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`agent_id`,`sub_agent_id`) REFERENCES `sub_agents`(`tenant_id`,`project_id`,`agent_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`agent_id`,`function_tool_id`) REFERENCES `function_tools`(`tenant_id`,`project_id`,`agent_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sub_agent_function_tool_relations`("tenant_id", "id", "project_id", "agent_id", "sub_agent_id", "function_tool_id", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "agent_id", "sub_agent_id", "function_tool_id", "created_at", "updated_at" FROM `sub_agent_function_tool_relations`;--> statement-breakpoint
DROP TABLE `sub_agent_function_tool_relations`;--> statement-breakpoint
ALTER TABLE `__new_sub_agent_function_tool_relations` RENAME TO `sub_agent_function_tool_relations`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
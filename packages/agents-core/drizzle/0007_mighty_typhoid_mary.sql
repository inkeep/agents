ALTER TABLE `agent_graph` RENAME TO `agent`;--> statement-breakpoint
ALTER TABLE `agent` RENAME COLUMN "graph_prompt" TO "prompt";--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_agent` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`default_sub_agent_id` text,
	`context_config_id` text,
	`models` text,
	`status_updates` text,
	`prompt` text,
	`stop_when` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_agent`("tenant_id", "id", "project_id", "name", "description", "default_sub_agent_id", "context_config_id", "models", "status_updates", "prompt", "stop_when", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "name", "description", "default_sub_agent_id", "context_config_id", "models", "status_updates", "prompt", "stop_when", "created_at", "updated_at" FROM `agent`;--> statement-breakpoint
DROP TABLE `agent`;--> statement-breakpoint
ALTER TABLE `__new_agent` RENAME TO `agent`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_agent_function_tool_relations` (
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
INSERT INTO `__new_agent_function_tool_relations`("tenant_id", "id", "project_id", "agent_id", "sub_agent_id", "function_tool_id", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "graph_id", "sub_agent_id", "function_tool_id", "created_at", "updated_at" FROM `agent_function_tool_relations`;--> statement-breakpoint
DROP TABLE `agent_function_tool_relations`;--> statement-breakpoint
ALTER TABLE `__new_agent_function_tool_relations` RENAME TO `agent_function_tool_relations`;--> statement-breakpoint
CREATE TABLE `__new_api_keys` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`public_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`name` text,
	`last_used_at` text,
	`expires_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`agent_id`) REFERENCES `agent`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_api_keys`("tenant_id", "id", "project_id", "agent_id", "public_id", "key_hash", "key_prefix", "name", "last_used_at", "expires_at", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "graph_id", "public_id", "key_hash", "key_prefix", "name", "last_used_at", "expires_at", "created_at", "updated_at" FROM `api_keys`;--> statement-breakpoint
DROP TABLE `api_keys`;--> statement-breakpoint
ALTER TABLE `__new_api_keys` RENAME TO `api_keys`;--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_public_id_unique` ON `api_keys` (`public_id`);--> statement-breakpoint
CREATE INDEX `api_keys_tenant_agent_idx` ON `api_keys` (`tenant_id`,`agent_id`);--> statement-breakpoint
CREATE INDEX `api_keys_prefix_idx` ON `api_keys` (`key_prefix`);--> statement-breakpoint
CREATE INDEX `api_keys_public_id_idx` ON `api_keys` (`public_id`);--> statement-breakpoint
CREATE TABLE `__new_context_configs` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`headers_schema` blob,
	`context_variables` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `agent_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`agent_id`) REFERENCES `agent`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_context_configs`("tenant_id", "id", "project_id", "agent_id", "headers_schema", "context_variables", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "graph_id", "headers_schema", "context_variables", "created_at", "updated_at" FROM `context_configs`;--> statement-breakpoint
DROP TABLE `context_configs`;--> statement-breakpoint
ALTER TABLE `__new_context_configs` RENAME TO `context_configs`;--> statement-breakpoint
CREATE TABLE `__new_external_agents` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`base_url` text NOT NULL,
	`credential_reference_id` text,
	`headers` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `agent_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`agent_id`) REFERENCES `agent`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`credential_reference_id`) REFERENCES `credential_references`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_external_agents`("tenant_id", "id", "project_id", "agent_id", "name", "description", "base_url", "credential_reference_id", "headers", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "graph_id", "name", "description", "base_url", "credential_reference_id", "headers", "created_at", "updated_at" FROM `external_agents`;--> statement-breakpoint
DROP TABLE `external_agents`;--> statement-breakpoint
ALTER TABLE `__new_external_agents` RENAME TO `external_agents`;--> statement-breakpoint
CREATE TABLE `__new_function_tools` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`function_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `agent_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`agent_id`) REFERENCES `agent`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`function_id`) REFERENCES `functions`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_function_tools`("tenant_id", "id", "project_id", "agent_id", "name", "description", "function_id", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "graph_id", "name", "description", "function_id", "created_at", "updated_at" FROM `function_tools`;--> statement-breakpoint
DROP TABLE `function_tools`;--> statement-breakpoint
ALTER TABLE `__new_function_tools` RENAME TO `function_tools`;--> statement-breakpoint
CREATE TABLE `__new_sub_agent_artifact_components` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`sub_agent_id` text NOT NULL,
	`artifact_component_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `agent_id`, `sub_agent_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`agent_id`,`sub_agent_id`) REFERENCES `sub_agents`(`tenant_id`,`project_id`,`agent_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`artifact_component_id`) REFERENCES `artifact_components`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sub_agent_artifact_components`("tenant_id", "id", "project_id", "agent_id", "sub_agent_id", "artifact_component_id", "created_at") SELECT "tenant_id", "id", "project_id", "graph_id", "sub_agent_id", "artifact_component_id", "created_at" FROM `sub_agent_artifact_components`;--> statement-breakpoint
DROP TABLE `sub_agent_artifact_components`;--> statement-breakpoint
ALTER TABLE `__new_sub_agent_artifact_components` RENAME TO `sub_agent_artifact_components`;--> statement-breakpoint
CREATE TABLE `__new_sub_agent_data_components` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`sub_agent_id` text NOT NULL,
	`data_component_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`agent_id`,`sub_agent_id`) REFERENCES `sub_agents`(`tenant_id`,`project_id`,`agent_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`data_component_id`) REFERENCES `data_components`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sub_agent_data_components`("tenant_id", "id", "project_id", "agent_id", "sub_agent_id", "data_component_id", "created_at") SELECT "tenant_id", "id", "project_id", "graph_id", "sub_agent_id", "data_component_id", "created_at" FROM `sub_agent_data_components`;--> statement-breakpoint
DROP TABLE `sub_agent_data_components`;--> statement-breakpoint
ALTER TABLE `__new_sub_agent_data_components` RENAME TO `sub_agent_data_components`;--> statement-breakpoint
CREATE TABLE `__new_sub_agent_relations` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`source_sub_agent_id` text NOT NULL,
	`target_sub_agent_id` text,
	`external_sub_agent_id` text,
	`relation_type` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `agent_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`agent_id`) REFERENCES `agent`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sub_agent_relations`("tenant_id", "id", "project_id", "agent_id", "source_sub_agent_id", "target_sub_agent_id", "external_sub_agent_id", "relation_type", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "graph_id", "source_sub_agent_id", "target_sub_agent_id", "external_sub_agent_id", "relation_type", "created_at", "updated_at" FROM `sub_agent_relations`;--> statement-breakpoint
DROP TABLE `sub_agent_relations`;--> statement-breakpoint
ALTER TABLE `__new_sub_agent_relations` RENAME TO `sub_agent_relations`;--> statement-breakpoint
CREATE TABLE `__new_sub_agent_tool_relations` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`sub_agent_id` text NOT NULL,
	`tool_id` text NOT NULL,
	`selected_tools` blob,
	`headers` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `agent_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`agent_id`,`sub_agent_id`) REFERENCES `sub_agents`(`tenant_id`,`project_id`,`agent_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`tool_id`) REFERENCES `tools`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sub_agent_tool_relations`("tenant_id", "id", "project_id", "agent_id", "sub_agent_id", "tool_id", "selected_tools", "headers", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "graph_id", "sub_agent_id", "tool_id", "selected_tools", "headers", "created_at", "updated_at" FROM `sub_agent_tool_relations`;--> statement-breakpoint
DROP TABLE `sub_agent_tool_relations`;--> statement-breakpoint
ALTER TABLE `__new_sub_agent_tool_relations` RENAME TO `sub_agent_tool_relations`;--> statement-breakpoint
CREATE TABLE `__new_sub_agents` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`prompt` text NOT NULL,
	`conversation_history_config` text,
	`models` text,
	`stop_when` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `agent_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`agent_id`) REFERENCES `agent`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sub_agents`("tenant_id", "id", "project_id", "agent_id", "name", "description", "prompt", "conversation_history_config", "models", "stop_when", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "graph_id", "name", "description", "prompt", "conversation_history_config", "models", "stop_when", "created_at", "updated_at" FROM `sub_agents`;--> statement-breakpoint
DROP TABLE `sub_agents`;--> statement-breakpoint
ALTER TABLE `__new_sub_agents` RENAME TO `sub_agents`;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`sub_agent_id` text NOT NULL,
	`context_id` text NOT NULL,
	`status` text NOT NULL,
	`metadata` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`agent_id`,`sub_agent_id`) REFERENCES `sub_agents`(`tenant_id`,`project_id`,`agent_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("tenant_id", "id", "project_id", "agent_id", "sub_agent_id", "context_id", "status", "metadata", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "graph_id", "sub_agent_id", "context_id", "status", "metadata", "created_at", "updated_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;
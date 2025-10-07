ALTER TABLE `agent_artifact_components` RENAME TO `sub_agent_artifact_components`;--> statement-breakpoint
ALTER TABLE `agent_data_components` RENAME TO `sub_agent_data_components`;--> statement-breakpoint
ALTER TABLE `agent_relations` RENAME TO `sub_agent_relations`;--> statement-breakpoint
ALTER TABLE `agent_tool_relations` RENAME TO `sub_agent_tool_relations`;--> statement-breakpoint
ALTER TABLE `agents` RENAME TO `sub_agents`;--> statement-breakpoint
ALTER TABLE `sub_agent_artifact_components` RENAME COLUMN "agent_id" TO "sub_agent_id";--> statement-breakpoint
ALTER TABLE `sub_agent_data_components` RENAME COLUMN "agent_id" TO "sub_agent_id";--> statement-breakpoint
ALTER TABLE `sub_agent_relations` RENAME COLUMN "source_agent_id" TO "source_sub_agent_id";--> statement-breakpoint
ALTER TABLE `sub_agent_relations` RENAME COLUMN "target_agent_id" TO "target_sub_agent_id";--> statement-breakpoint
ALTER TABLE `sub_agent_relations` RENAME COLUMN "external_agent_id" TO "external_sub_agent_id";--> statement-breakpoint
ALTER TABLE `sub_agent_tool_relations` RENAME COLUMN "agent_id" TO "sub_agent_id";--> statement-breakpoint
ALTER TABLE `agent_graph` RENAME COLUMN "default_agent_id" TO "default_sub_agent_id";--> statement-breakpoint
ALTER TABLE `conversations` RENAME COLUMN "active_agent_id" TO "active_sub_agent_id";--> statement-breakpoint
ALTER TABLE `messages` RENAME COLUMN "from_agent_id" TO "from_sub_agent_id";--> statement-breakpoint
ALTER TABLE `messages` RENAME COLUMN "to_agent_id" TO "to_sub_agent_id";--> statement-breakpoint
ALTER TABLE `messages` RENAME COLUMN "from_external_agent_id" TO "from_external_sub_agent_id";--> statement-breakpoint
ALTER TABLE `messages` RENAME COLUMN "to_external_agent_id" TO "to_external_sub_agent_id";--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_sub_agent_artifact_components` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`graph_id` text NOT NULL,
	`sub_agent_id` text NOT NULL,
	`artifact_component_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `graph_id`, `sub_agent_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`graph_id`,`sub_agent_id`) REFERENCES `sub_agents`(`tenant_id`,`project_id`,`graph_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`artifact_component_id`) REFERENCES `artifact_components`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sub_agent_artifact_components`("tenant_id", "id", "project_id", "graph_id", "sub_agent_id", "artifact_component_id", "created_at") SELECT "tenant_id", "id", "project_id", "graph_id", "sub_agent_id", "artifact_component_id", "created_at" FROM `sub_agent_artifact_components`;--> statement-breakpoint
DROP TABLE `sub_agent_artifact_components`;--> statement-breakpoint
ALTER TABLE `__new_sub_agent_artifact_components` RENAME TO `sub_agent_artifact_components`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_sub_agent_data_components` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`graph_id` text NOT NULL,
	`sub_agent_id` text NOT NULL,
	`data_component_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`graph_id`,`sub_agent_id`) REFERENCES `sub_agents`(`tenant_id`,`project_id`,`graph_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`data_component_id`) REFERENCES `data_components`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sub_agent_data_components`("tenant_id", "id", "project_id", "graph_id", "sub_agent_id", "data_component_id", "created_at") SELECT "tenant_id", "id", "project_id", "graph_id", "sub_agent_id", "data_component_id", "created_at" FROM `sub_agent_data_components`;--> statement-breakpoint
DROP TABLE `sub_agent_data_components`;--> statement-breakpoint
ALTER TABLE `__new_sub_agent_data_components` RENAME TO `sub_agent_data_components`;--> statement-breakpoint
CREATE TABLE `__new_sub_agent_relations` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`graph_id` text NOT NULL,
	`source_sub_agent_id` text NOT NULL,
	`target_sub_agent_id` text,
	`external_sub_agent_id` text,
	`relation_type` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `graph_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`graph_id`) REFERENCES `agent_graph`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sub_agent_relations`("tenant_id", "id", "project_id", "graph_id", "source_sub_agent_id", "target_sub_agent_id", "external_sub_agent_id", "relation_type", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "graph_id", "source_sub_agent_id", "target_sub_agent_id", "external_sub_agent_id", "relation_type", "created_at", "updated_at" FROM `sub_agent_relations`;--> statement-breakpoint
DROP TABLE `sub_agent_relations`;--> statement-breakpoint
ALTER TABLE `__new_sub_agent_relations` RENAME TO `sub_agent_relations`;--> statement-breakpoint
CREATE TABLE `__new_sub_agent_tool_relations` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`graph_id` text NOT NULL,
	`sub_agent_id` text NOT NULL,
	`tool_id` text NOT NULL,
	`selected_tools` blob,
	`headers` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `graph_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`graph_id`,`sub_agent_id`) REFERENCES `sub_agents`(`tenant_id`,`project_id`,`graph_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`tool_id`) REFERENCES `tools`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sub_agent_tool_relations`("tenant_id", "id", "project_id", "graph_id", "sub_agent_id", "tool_id", "selected_tools", "headers", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "graph_id", "sub_agent_id", "tool_id", "selected_tools", "headers", "created_at", "updated_at" FROM `sub_agent_tool_relations`;--> statement-breakpoint
DROP TABLE `sub_agent_tool_relations`;--> statement-breakpoint
ALTER TABLE `__new_sub_agent_tool_relations` RENAME TO `sub_agent_tool_relations`;--> statement-breakpoint
CREATE TABLE `__new_sub_agents` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`graph_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`prompt` text NOT NULL,
	`conversation_history_config` text,
	`models` text,
	`stop_when` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `graph_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`graph_id`) REFERENCES `agent_graph`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sub_agents`("tenant_id", "id", "project_id", "graph_id", "name", "description", "prompt", "conversation_history_config", "models", "stop_when", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "graph_id", "name", "description", "prompt", "conversation_history_config", "models", "stop_when", "created_at", "updated_at" FROM `sub_agents`;--> statement-breakpoint
DROP TABLE `sub_agents`;--> statement-breakpoint
ALTER TABLE `__new_sub_agents` RENAME TO `sub_agents`;--> statement-breakpoint
ALTER TABLE `messages` DROP COLUMN `agent_id`;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`graph_id` text NOT NULL,
	`sub_agent_id` text NOT NULL,
	`context_id` text NOT NULL,
	`status` text NOT NULL,
	`metadata` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`graph_id`,`sub_agent_id`) REFERENCES `sub_agents`(`tenant_id`,`project_id`,`graph_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("tenant_id", "id", "project_id", "graph_id", "sub_agent_id", "context_id", "status", "metadata", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "graph_id", "agent_id", "context_id", "status", "metadata", "created_at", "updated_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;
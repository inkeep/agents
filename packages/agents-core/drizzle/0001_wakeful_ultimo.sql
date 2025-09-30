PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tasks` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`graph_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`context_id` text NOT NULL,
	`status` text NOT NULL,
	`metadata` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`graph_id`,`agent_id`) REFERENCES `agents`(`tenant_id`,`project_id`,`graph_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tasks`("tenant_id", "id", "project_id", "graph_id", "agent_id", "context_id", "status", "metadata", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", (SELECT "graph_id" FROM "agents" WHERE "agents"."tenant_id" = "tasks"."tenant_id" AND "agents"."project_id" = "tasks"."project_id" AND "agents"."id" = "tasks"."agent_id" LIMIT 1), "agent_id", "context_id", "status", "metadata", "created_at", "updated_at" FROM `tasks`;--> statement-breakpoint
DROP TABLE `tasks`;--> statement-breakpoint
ALTER TABLE `__new_tasks` RENAME TO `tasks`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE TABLE `__new_agents` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`graph_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
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
INSERT INTO `__new_agents`("tenant_id", "id", "project_id", "graph_id", "name", "description", "prompt", "conversation_history_config", "models", "stop_when", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "graph_id", "name", "description", "prompt", "conversation_history_config", "models", "stop_when", "created_at", "updated_at" FROM `agents`;--> statement-breakpoint
DROP TABLE `agents`;--> statement-breakpoint
ALTER TABLE `__new_agents` RENAME TO `agents`;--> statement-breakpoint
CREATE TABLE `__new_api_keys` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`graph_id` text NOT NULL,
	`public_id` text NOT NULL,
	`key_hash` text NOT NULL,
	`key_prefix` text NOT NULL,
	`name` text,
	`last_used_at` text,
	`expires_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`graph_id`) REFERENCES `agent_graph`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
-- Note: Existing api_keys will be deleted since we cannot infer graph_id from old schema
DROP TABLE `api_keys`;--> statement-breakpoint
ALTER TABLE `__new_api_keys` RENAME TO `api_keys`;--> statement-breakpoint
CREATE UNIQUE INDEX `api_keys_public_id_unique` ON `api_keys` (`public_id`);--> statement-breakpoint
CREATE INDEX `api_keys_tenant_graph_idx` ON `api_keys` (`tenant_id`,`graph_id`);--> statement-breakpoint
CREATE INDEX `api_keys_prefix_idx` ON `api_keys` (`key_prefix`);--> statement-breakpoint
CREATE INDEX `api_keys_public_id_idx` ON `api_keys` (`public_id`);--> statement-breakpoint
CREATE TABLE `__new_artifact_components` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`summary_props` blob,
	`full_props` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_artifact_components`("tenant_id", "id", "project_id", "name", "description", "summary_props", "full_props", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "name", "description", "summary_props", "full_props", "created_at", "updated_at" FROM `artifact_components`;--> statement-breakpoint
DROP TABLE `artifact_components`;--> statement-breakpoint
ALTER TABLE `__new_artifact_components` RENAME TO `artifact_components`;--> statement-breakpoint
CREATE TABLE `__new_context_configs` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`request_context_schema` blob,
	`context_variables` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_context_configs`("tenant_id", "id", "project_id", "name", "description", "request_context_schema", "context_variables", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "name", "description", "request_context_schema", "context_variables", "created_at", "updated_at" FROM `context_configs`;--> statement-breakpoint
DROP TABLE `context_configs`;--> statement-breakpoint
ALTER TABLE `__new_context_configs` RENAME TO `context_configs`;--> statement-breakpoint
CREATE TABLE `__new_data_components` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`props` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_data_components`("tenant_id", "id", "project_id", "name", "description", "props", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "name", "description", "props", "created_at", "updated_at" FROM `data_components`;--> statement-breakpoint
DROP TABLE `data_components`;--> statement-breakpoint
ALTER TABLE `__new_data_components` RENAME TO `data_components`;--> statement-breakpoint
CREATE TABLE `__new_external_agents` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`graph_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`base_url` text NOT NULL,
	`credential_reference_id` text,
	`headers` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `graph_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`graph_id`) REFERENCES `agent_graph`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`credential_reference_id`) REFERENCES `credential_references`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_external_agents`("tenant_id", "id", "project_id", "graph_id", "name", "description", "base_url", "credential_reference_id", "headers", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "graph_id", "name", "description", "base_url", "credential_reference_id", "headers", "created_at", "updated_at" FROM `external_agents`;--> statement-breakpoint
DROP TABLE `external_agents`;--> statement-breakpoint
ALTER TABLE `__new_external_agents` RENAME TO `external_agents`;--> statement-breakpoint
CREATE TABLE `__new_projects` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`models` text,
	`stop_when` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `id`)
);
--> statement-breakpoint
INSERT INTO `__new_projects`("tenant_id", "id", "name", "description", "models", "stop_when", "created_at", "updated_at") SELECT "tenant_id", "id", "name", "description", "models", "stop_when", "created_at", "updated_at" FROM `projects`;--> statement-breakpoint
DROP TABLE `projects`;--> statement-breakpoint
ALTER TABLE `__new_projects` RENAME TO `projects`;--> statement-breakpoint
CREATE INDEX `ledger_artifacts_task_id_idx` ON `ledger_artifacts` (`task_id`);--> statement-breakpoint
CREATE INDEX `ledger_artifacts_tool_call_id_idx` ON `ledger_artifacts` (`tool_call_id`);--> statement-breakpoint
CREATE INDEX `ledger_artifacts_context_id_idx` ON `ledger_artifacts` (`context_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_artifacts_task_context_name_unique` ON `ledger_artifacts` (`task_id`,`context_id`,`name`);
CREATE TABLE `agent_artifact_components` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`graph_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`artifact_component_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `graph_id`, `agent_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`graph_id`,`agent_id`) REFERENCES `agents`(`tenant_id`,`project_id`,`graph_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`artifact_component_id`) REFERENCES `artifact_components`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_data_components` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`graph_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`data_component_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`graph_id`,`agent_id`) REFERENCES `agents`(`tenant_id`,`project_id`,`graph_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`data_component_id`) REFERENCES `data_components`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_graph` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`default_agent_id` text,
	`context_config_id` text,
	`models` text,
	`status_updates` text,
	`graph_prompt` text,
	`stop_when` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_relations` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`graph_id` text NOT NULL,
	`source_agent_id` text NOT NULL,
	`target_agent_id` text,
	`external_agent_id` text,
	`relation_type` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `graph_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`graph_id`) REFERENCES `agent_graph`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agent_tool_relations` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`graph_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`tool_id` text NOT NULL,
	`selected_tools` blob,
	`headers` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `graph_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`graph_id`,`agent_id`) REFERENCES `agents`(`tenant_id`,`project_id`,`graph_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`tool_id`) REFERENCES `tools`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `agents` (
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
CREATE TABLE `api_keys` (
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
CREATE UNIQUE INDEX `api_keys_public_id_unique` ON `api_keys` (`public_id`);--> statement-breakpoint
CREATE INDEX `api_keys_tenant_graph_idx` ON `api_keys` (`tenant_id`,`graph_id`);--> statement-breakpoint
CREATE INDEX `api_keys_prefix_idx` ON `api_keys` (`key_prefix`);--> statement-breakpoint
CREATE INDEX `api_keys_public_id_idx` ON `api_keys` (`public_id`);--> statement-breakpoint
CREATE TABLE `artifact_components` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`summary_props` blob,
	`full_props` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `context_cache` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`context_config_id` text NOT NULL,
	`context_variable_key` text NOT NULL,
	`value` blob NOT NULL,
	`request_hash` text,
	`fetched_at` text NOT NULL,
	`fetch_source` text,
	`fetch_duration_ms` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `context_cache_lookup_idx` ON `context_cache` (`conversation_id`,`context_config_id`,`context_variable_key`);--> statement-breakpoint
CREATE TABLE `context_configs` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`request_context_schema` blob,
	`context_variables` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`user_id` text,
	`active_agent_id` text NOT NULL,
	`title` text,
	`last_context_resolution` text,
	`metadata` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `credential_references` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`type` text NOT NULL,
	`credential_store_id` text NOT NULL,
	`retrieval_params` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `data_components` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`props` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `external_agents` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`graph_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
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
CREATE TABLE `ledger_artifacts` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`task_id` text NOT NULL,
	`tool_call_id` text,
	`context_id` text NOT NULL,
	`type` text DEFAULT 'source' NOT NULL,
	`name` text,
	`description` text,
	`parts` blob,
	`metadata` blob,
	`summary` text,
	`mime` blob,
	`visibility` text DEFAULT 'context',
	`allowed_agents` blob,
	`derived_from` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`, `task_id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `ledger_artifacts_task_id_idx` ON `ledger_artifacts` (`task_id`);--> statement-breakpoint
CREATE INDEX `ledger_artifacts_tool_call_id_idx` ON `ledger_artifacts` (`tool_call_id`);--> statement-breakpoint
CREATE INDEX `ledger_artifacts_context_id_idx` ON `ledger_artifacts` (`context_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `ledger_artifacts_task_context_name_unique` ON `ledger_artifacts` (`task_id`,`context_id`,`name`);--> statement-breakpoint
CREATE TABLE `messages` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`role` text NOT NULL,
	`from_agent_id` text,
	`to_agent_id` text,
	`from_external_agent_id` text,
	`to_external_agent_id` text,
	`content` blob NOT NULL,
	`visibility` text DEFAULT 'user-facing' NOT NULL,
	`message_type` text DEFAULT 'chat' NOT NULL,
	`agent_id` text,
	`task_id` text,
	`parent_message_id` text,
	`a2a_task_id` text,
	`a2a_session_id` text,
	`metadata` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `projects` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`models` text,
	`stop_when` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `id`)
);
--> statement-breakpoint
CREATE TABLE `task_relations` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`parent_task_id` text NOT NULL,
	`child_task_id` text NOT NULL,
	`relation_type` text DEFAULT 'parent_child',
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `tasks` (
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
CREATE TABLE `tools` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`config` blob NOT NULL,
	`credential_reference_id` text,
	`headers` blob,
	`image_url` text,
	`capabilities` blob,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);

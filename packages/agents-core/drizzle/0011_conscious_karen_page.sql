PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_external_agents` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`base_url` text NOT NULL,
	`credential_reference_id` text,
	`headers` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`credential_reference_id`) REFERENCES `credential_references`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_external_agents`("tenant_id", "id", "project_id", "name", "description", "base_url", "credential_reference_id", "headers", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "name", "description", "base_url", "credential_reference_id", "headers", "created_at", "updated_at" FROM `external_agents`;--> statement-breakpoint
DROP TABLE `external_agents`;--> statement-breakpoint
ALTER TABLE `__new_external_agents` RENAME TO `external_agents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
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
	FOREIGN KEY (`tenant_id`,`project_id`,`agent_id`) REFERENCES `agent`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`external_sub_agent_id`) REFERENCES `external_agents`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_sub_agent_relations`("tenant_id", "id", "project_id", "agent_id", "source_sub_agent_id", "target_sub_agent_id", "external_sub_agent_id", "relation_type", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "agent_id", "source_sub_agent_id", "target_sub_agent_id", "external_sub_agent_id", "relation_type", "created_at", "updated_at" FROM `sub_agent_relations`;--> statement-breakpoint
DROP TABLE `sub_agent_relations`;--> statement-breakpoint
ALTER TABLE `__new_sub_agent_relations` RENAME TO `sub_agent_relations`;
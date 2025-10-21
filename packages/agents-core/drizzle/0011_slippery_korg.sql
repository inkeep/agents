CREATE TABLE `sub_agent_external_agent_relations` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`sub_agent_id` text NOT NULL,
	`external_agent_id` text NOT NULL,
	`headers` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `agent_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`agent_id`,`sub_agent_id`) REFERENCES `sub_agents`(`tenant_id`,`project_id`,`agent_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`external_agent_id`) REFERENCES `external_agents`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_external_agents` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`base_url` text NOT NULL,
	`credential_reference_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`credential_reference_id`) REFERENCES `credential_references`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_external_agents`("tenant_id", "id", "project_id", "name", "description", "base_url", "credential_reference_id", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "name", "description", "base_url", "credential_reference_id", "created_at", "updated_at" FROM `external_agents`;--> statement-breakpoint
DROP TABLE `external_agents`;--> statement-breakpoint
ALTER TABLE `__new_external_agents` RENAME TO `external_agents`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
ALTER TABLE `sub_agent_relations` DROP COLUMN `external_sub_agent_id`;
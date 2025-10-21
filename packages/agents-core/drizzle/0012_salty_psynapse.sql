CREATE TABLE `sub_agent_team_agent_relations` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`sub_agent_id` text NOT NULL,
	`target_agent_id` text NOT NULL,
	`headers` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `agent_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`agent_id`,`sub_agent_id`) REFERENCES `sub_agents`(`tenant_id`,`project_id`,`agent_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`target_agent_id`) REFERENCES `agent`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `messages` ADD `from_team_agent_id` text;--> statement-breakpoint
ALTER TABLE `messages` ADD `to_team_agent_id` text;
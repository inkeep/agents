CREATE TABLE `functions` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`input_schema` blob,
	`execute_code` text NOT NULL,
	`dependencies` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
ALTER TABLE `tools` ADD `description` text;--> statement-breakpoint
ALTER TABLE `tools` ADD `function_id` text;--> statement-breakpoint
ALTER TABLE `projects` ADD `sandbox_config` text;

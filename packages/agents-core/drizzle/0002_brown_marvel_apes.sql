CREATE TABLE `function_tools` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`graph_id` text NOT NULL,
	`agent_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`function_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `graph_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`graph_id`,`agent_id`) REFERENCES `agents`(`tenant_id`,`project_id`,`graph_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`function_id`) REFERENCES `functions`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `functions` (
	`id` text PRIMARY KEY NOT NULL,
	`input_schema` blob,
	`execute_code` text NOT NULL,
	`dependencies` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
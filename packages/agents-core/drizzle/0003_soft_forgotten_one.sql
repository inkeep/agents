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
);
--> statement-breakpoint
ALTER TABLE `projects` ADD `sandbox_config` text;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tools` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`config` blob NOT NULL,
	`function_id` text,
	`credential_reference_id` text,
	`headers` blob,
	`image_url` text,
	`capabilities` blob,
	`last_error` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`project_id`,`function_id`) REFERENCES `functions`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_tools`("tenant_id", "id", "project_id", "name", "config", "credential_reference_id", "headers", "image_url", "capabilities", "last_error", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "name", "config", "credential_reference_id", "headers", "image_url", "capabilities", "last_error", "created_at", "updated_at" FROM `tools`;--> statement-breakpoint
DROP TABLE `tools`;--> statement-breakpoint
ALTER TABLE `__new_tools` RENAME TO `tools`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
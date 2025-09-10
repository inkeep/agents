PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_tools` (
	`tenant_id` text NOT NULL,
	`project_id` text NOT NULL,
	`id` text NOT NULL,
	`name` text NOT NULL,
	`config` blob NOT NULL,
	`credential_reference_id` text,
	`headers` blob,
	`image_url` text,
	`capabilities` blob,
	`status` text DEFAULT 'unknown' NOT NULL,
	`last_health_check` text,
	`last_error` text,
	`available_tools` blob,
	`last_tools_sync` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`,`credential_reference_id`) REFERENCES `credential_references`(`tenant_id`,`project_id`,`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
INSERT INTO `__new_tools`("tenant_id", "project_id", "id", "name", "config", "credential_reference_id", "headers", "image_url", "capabilities", "status", "last_health_check", "last_error", "available_tools", "last_tools_sync", "created_at", "updated_at") SELECT "tenant_id", "project_id", "id", "name", "config", "credential_reference_id", "headers", "image_url", "capabilities", "status", "last_health_check", "last_error", "available_tools", "last_tools_sync", "created_at", "updated_at" FROM `tools`;--> statement-breakpoint
DROP TABLE `tools`;--> statement-breakpoint
ALTER TABLE `__new_tools` RENAME TO `tools`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
PRAGMA foreign_keys=OFF;--> statement-breakpoint

-- Create new table with NOT NULL constraint on name
CREATE TABLE `__new_credential_references` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`credential_store_id` text NOT NULL,
	`retrieval_params` blob,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint

-- Copy existing data, using id as the name for all existing rows
INSERT INTO `__new_credential_references`("tenant_id", "id", "project_id", "name", "type", "credential_store_id", "retrieval_params", "created_at", "updated_at") 
SELECT "tenant_id", "id", "project_id", "id", "type", "credential_store_id", "retrieval_params", "created_at", "updated_at" 
FROM `credential_references`;--> statement-breakpoint

-- Drop old table
DROP TABLE `credential_references`;--> statement-breakpoint

-- Rename new table
ALTER TABLE `__new_credential_references` RENAME TO `credential_references`;--> statement-breakpoint

PRAGMA foreign_keys=ON;
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_data_components` (
	`tenant_id` text NOT NULL,
	`id` text NOT NULL,
	`project_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`props` blob,
	`render` blob DEFAULT 'null',
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	PRIMARY KEY(`tenant_id`, `project_id`, `id`),
	FOREIGN KEY (`tenant_id`,`project_id`) REFERENCES `projects`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_data_components`("tenant_id", "id", "project_id", "name", "description", "props", "render", "created_at", "updated_at") SELECT "tenant_id", "id", "project_id", "name", "description", "props", NULL, "created_at", "updated_at" FROM `data_components` WHERE EXISTS(SELECT 1 FROM sqlite_master WHERE type='table' AND name='data_components');--> statement-breakpoint
DROP TABLE IF EXISTS `data_components`;--> statement-breakpoint
ALTER TABLE `__new_data_components` RENAME TO `data_components`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
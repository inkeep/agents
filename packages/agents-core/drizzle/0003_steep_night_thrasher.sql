DROP TABLE `function_tools`;--> statement-breakpoint
ALTER TABLE `tools` ADD `description` text;--> statement-breakpoint
ALTER TABLE `tools` ADD `function_id` text REFERENCES functions(id);--> statement-breakpoint
ALTER TABLE `projects` ADD `sandbox_config` text;
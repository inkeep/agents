ALTER TABLE `context_configs` RENAME COLUMN "request_context_schema" TO "headers_schema";--> statement-breakpoint
ALTER TABLE `context_configs` DROP COLUMN `name`;--> statement-breakpoint
ALTER TABLE `context_configs` DROP COLUMN `description`;
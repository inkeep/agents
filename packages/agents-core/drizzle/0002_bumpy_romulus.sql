ALTER TABLE `artifact_components` ADD `props` blob;--> statement-breakpoint
ALTER TABLE `artifact_components` DROP COLUMN `summary_props`;--> statement-breakpoint
ALTER TABLE `artifact_components` DROP COLUMN `full_props`;
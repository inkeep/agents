-- Add column as nullable first to handle existing rows
ALTER TABLE "dataset_run_conversation_relations" ADD COLUMN "dataset_item_id" text;--> statement-breakpoint
-- Delete existing rows that don't have dataset_item_id (old data without proper mapping)
-- This is safe because we can't reliably match old conversations to dataset items
DELETE FROM "dataset_run_conversation_relations" WHERE "dataset_item_id" IS NULL;--> statement-breakpoint
-- Now make it NOT NULL since we've cleaned up old data
ALTER TABLE "dataset_run_conversation_relations" ALTER COLUMN "dataset_item_id" SET NOT NULL;--> statement-breakpoint
-- Add foreign key constraint
ALTER TABLE "dataset_run_conversation_relations" ADD CONSTRAINT "dataset_run_conversation_relations_item_fk" FOREIGN KEY ("tenant_id","project_id","dataset_item_id") REFERENCES "public"."dataset_item"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;
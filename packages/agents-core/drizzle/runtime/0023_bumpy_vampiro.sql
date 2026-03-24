ALTER TABLE "dataset_run" ADD COLUMN "ref" jsonb;--> statement-breakpoint
ALTER TABLE "evaluation_run" ADD COLUMN "ref" jsonb;--> statement-breakpoint
ALTER TABLE "scheduled_trigger_invocations" ADD COLUMN "ref" jsonb;--> statement-breakpoint
ALTER TABLE "trigger_invocations" ADD COLUMN "ref" jsonb;
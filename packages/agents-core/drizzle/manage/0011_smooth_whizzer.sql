ALTER TABLE "scheduled_triggers" ADD COLUMN "run_as_user_id" varchar(256);--> statement-breakpoint
ALTER TABLE "scheduled_triggers" ADD COLUMN "created_by" varchar(256);
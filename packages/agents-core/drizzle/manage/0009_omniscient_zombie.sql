ALTER TABLE "scheduled_triggers" ALTER COLUMN "max_retries" SET DEFAULT 1;--> statement-breakpoint
ALTER TABLE "scheduled_triggers" ALTER COLUMN "timeout_seconds" SET DEFAULT 900;
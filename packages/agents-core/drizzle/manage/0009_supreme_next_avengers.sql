ALTER TABLE "scheduled_workflows" ALTER COLUMN "status" SET DEFAULT 'pending';--> statement-breakpoint
ALTER TABLE "scheduled_workflows" ALTER COLUMN "status" SET NOT NULL;
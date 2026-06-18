ALTER TABLE "scheduled_triggers" ALTER COLUMN "agent_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "scheduled_triggers" ADD COLUMN "dataset_run_config_id" varchar(256);
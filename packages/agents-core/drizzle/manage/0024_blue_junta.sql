ALTER TABLE "webhook_destinations" ALTER COLUMN "url" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "webhook_destinations" ADD COLUMN "slack_channel_id" varchar(256);
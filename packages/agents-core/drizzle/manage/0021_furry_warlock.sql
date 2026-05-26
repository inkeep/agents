ALTER TABLE "webhook_destinations" ALTER COLUMN "headers" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "sub_agents" ADD COLUMN "output_contract" jsonb;
ALTER TABLE "conversations" ADD COLUMN "user_properties" jsonb;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "properties" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "user_properties" jsonb;--> statement-breakpoint
ALTER TABLE "messages" ADD COLUMN "properties" jsonb;
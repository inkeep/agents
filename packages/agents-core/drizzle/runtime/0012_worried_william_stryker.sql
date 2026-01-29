DROP TABLE "slack_link_codes" CASCADE;--> statement-breakpoint
DROP TABLE "slack_user_links" CASCADE;--> statement-breakpoint
ALTER TABLE "work_app_slack_account_link_codes" ADD COLUMN "original_intent" jsonb;
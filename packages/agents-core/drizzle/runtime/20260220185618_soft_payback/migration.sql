ALTER TABLE "organization" ADD COLUMN "preferred_auth_method" text;--> statement-breakpoint
ALTER TABLE "organization" ADD COLUMN "service_account_user_id" text;--> statement-breakpoint
ALTER TABLE "work_app_slack_workspaces" ADD COLUMN "should_allow_join_from_workspace" boolean DEFAULT false NOT NULL;
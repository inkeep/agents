ALTER TABLE "work_app_slack_workspaces" ADD COLUMN "default_agent_id" varchar(256);--> statement-breakpoint
ALTER TABLE "work_app_slack_workspaces" ADD COLUMN "default_project_id" varchar(256);--> statement-breakpoint
ALTER TABLE "work_app_slack_workspaces" ADD COLUMN "default_grant_access_to_members" boolean DEFAULT true;
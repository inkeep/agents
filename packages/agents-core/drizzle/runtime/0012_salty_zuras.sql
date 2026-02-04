-- Drop the string default first, convert varchar to boolean, then set boolean default
ALTER TABLE "work_app_slack_channel_agent_configs" ALTER COLUMN "enabled" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "work_app_slack_channel_agent_configs" 
  ALTER COLUMN "enabled" TYPE boolean 
  USING CASE WHEN "enabled" = 'true' THEN true ELSE false END;--> statement-breakpoint
ALTER TABLE "work_app_slack_channel_agent_configs" ALTER COLUMN "enabled" SET DEFAULT true;

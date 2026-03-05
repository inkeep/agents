CREATE TABLE "work_app_slack_mcp_tool_access_config" (
	"tool_id" varchar(256) NOT NULL,
	"tenant_id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"channel_access_mode" varchar(20) NOT NULL,
	"dm_enabled" boolean DEFAULT false NOT NULL,
	"channel_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "work_app_slack_mcp_tool_access_config_tool_id_pk" PRIMARY KEY("tool_id")
);
--> statement-breakpoint
ALTER TABLE "work_app_slack_mcp_tool_access_config" ADD CONSTRAINT "work_app_slack_mcp_tool_access_config_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_app_slack_mcp_tool_access_config_tenant_idx" ON "work_app_slack_mcp_tool_access_config" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "work_app_slack_mcp_tool_access_config_project_idx" ON "work_app_slack_mcp_tool_access_config" USING btree ("project_id");
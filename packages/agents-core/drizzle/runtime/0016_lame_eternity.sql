CREATE TABLE "pending_tool_auth_requests" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"tool_id" varchar(256) NOT NULL,
	"tool_name" varchar(256) NOT NULL,
	"conversation_id" varchar(512) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"surface_type" varchar(50),
	"surface_context" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "pending_tool_auth_requests_user_tool_idx" ON "pending_tool_auth_requests" USING btree ("user_id","tool_id");--> statement-breakpoint
CREATE INDEX "pending_tool_auth_requests_tenant_idx" ON "pending_tool_auth_requests" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "pending_tool_auth_requests_created_at_idx" ON "pending_tool_auth_requests" USING btree ("created_at");
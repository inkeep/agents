CREATE TABLE "tool_approval_decisions" (
	"tenant_id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"conversation_id" varchar(256) NOT NULL,
	"tool_call_id" varchar(256) NOT NULL,
	"approved" boolean NOT NULL,
	"reason" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tool_approval_decisions_tenant_id_project_id_conversation_id_tool_call_id_pk" PRIMARY KEY("tenant_id","project_id","conversation_id","tool_call_id")
);
--> statement-breakpoint
CREATE INDEX "tool_approval_decisions_cleanup_idx" ON "tool_approval_decisions" USING btree ("created_at");
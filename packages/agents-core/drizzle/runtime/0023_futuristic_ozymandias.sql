CREATE TABLE "workflow_executions" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"conversation_id" varchar(256) NOT NULL,
	"request_id" varchar(256),
	"status" varchar(50) DEFAULT 'running' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_executions_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE INDEX "workflow_executions_conversation_idx" ON "workflow_executions" USING btree ("tenant_id","project_id","conversation_id");
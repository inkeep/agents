CREATE TABLE "workflow_executions" (
	"id" varchar(256) NOT NULL,
	"tenant_id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"run_id" varchar(256),
	"agent_id" varchar(256) NOT NULL,
	"conversation_id" varchar(256),
	"status" varchar(50) DEFAULT 'starting' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_executions_id_pk" PRIMARY KEY("id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "workflow_executions_run_id_idx" ON "workflow_executions" USING btree ("run_id");--> statement-breakpoint
CREATE INDEX "workflow_executions_conversation_idx" ON "workflow_executions" USING btree ("tenant_id","project_id","conversation_id");--> statement-breakpoint
CREATE INDEX "workflow_executions_status_idx" ON "workflow_executions" USING btree ("status");
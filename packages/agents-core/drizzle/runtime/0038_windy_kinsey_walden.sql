CREATE TABLE "copilot_runs" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"ref" jsonb,
	"conversation_id" varchar(256) NOT NULL,
	"feedback_ids" jsonb,
	"status" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "copilot_runs_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE INDEX "copilot_runs_status_idx" ON "copilot_runs" USING btree ("tenant_id","project_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "copilot_runs_conversation_id_idx" ON "copilot_runs" USING btree ("conversation_id");
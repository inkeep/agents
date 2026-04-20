CREATE TABLE "copilot_runs" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"ref" jsonb,
	"conversation_ids" jsonb NOT NULL,
	"feedback_ids" jsonb,
	"triggered_by" varchar(256),
	"status" varchar(50) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "copilot_runs_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE INDEX "copilot_runs_status_idx" ON "copilot_runs" USING btree ("tenant_id","project_id","status");
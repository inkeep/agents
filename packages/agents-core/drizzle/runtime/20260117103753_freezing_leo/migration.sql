CREATE TABLE "trigger_invocations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"trigger_id" varchar(256) NOT NULL,
	"conversation_id" varchar(256),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"request_payload" jsonb NOT NULL,
	"transformed_payload" jsonb,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trigger_invocations_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
);
--> statement-breakpoint
CREATE INDEX "trigger_invocations_trigger_idx" ON "trigger_invocations" USING btree ("trigger_id","created_at");--> statement-breakpoint
CREATE INDEX "trigger_invocations_status_idx" ON "trigger_invocations" USING btree ("trigger_id","status");
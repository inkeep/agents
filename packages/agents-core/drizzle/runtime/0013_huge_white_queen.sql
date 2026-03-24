CREATE TABLE "scheduled_trigger_invocations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"scheduled_trigger_id" varchar(256) NOT NULL,
	"status" varchar(50) NOT NULL,
	"scheduled_for" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"resolved_payload" jsonb,
	"conversation_ids" jsonb DEFAULT '[]'::jsonb,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"idempotency_key" varchar(256) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_trigger_invocations_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "sched_invocations_idempotency_idx" ON "scheduled_trigger_invocations" USING btree ("idempotency_key");
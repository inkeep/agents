CREATE TABLE "scheduled_triggers" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"cron_expression" varchar(256),
	"run_at" timestamp with time zone,
	"payload" jsonb,
	"message_template" text,
	"max_retries" integer DEFAULT 3 NOT NULL,
	"retry_delay_seconds" integer DEFAULT 60 NOT NULL,
	"timeout_seconds" integer DEFAULT 300 NOT NULL,
	"workflow_run_id" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_triggers_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
);
--> statement-breakpoint
ALTER TABLE "scheduled_triggers" ADD CONSTRAINT "scheduled_triggers_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;
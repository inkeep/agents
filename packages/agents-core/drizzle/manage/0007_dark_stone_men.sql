CREATE TABLE "scheduled_triggers" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"cron_expression" varchar(256),
	"cron_timezone" varchar(64) DEFAULT 'UTC',
	"run_at" timestamp with time zone,
	"payload" jsonb,
	"message_template" text,
	"max_retries" numeric DEFAULT 1 NOT NULL,
	"retry_delay_seconds" numeric DEFAULT 60 NOT NULL,
	"timeout_seconds" numeric DEFAULT 900 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_triggers_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
);
--> statement-breakpoint
CREATE TABLE "scheduled_workflows" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"workflow_run_id" varchar(256),
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"scheduled_trigger_id" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_workflows_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
);
--> statement-breakpoint
ALTER TABLE "scheduled_triggers" ADD CONSTRAINT "scheduled_triggers_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_workflows" ADD CONSTRAINT "scheduled_workflows_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_workflows" ADD CONSTRAINT "scheduled_workflows_trigger_fk" FOREIGN KEY ("tenant_id","project_id","agent_id","scheduled_trigger_id") REFERENCES "public"."scheduled_triggers"("tenant_id","project_id","agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" DROP COLUMN "is_work_app";
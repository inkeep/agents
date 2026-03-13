CREATE TABLE "scheduler_state" (
	"id" varchar(64) PRIMARY KEY DEFAULT 'singleton' NOT NULL,
	"current_run_id" varchar(256),
	"deployment_id" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trigger_schedules" (
	"tenant_id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"scheduled_trigger_id" varchar(256) NOT NULL,
	"cron_expression" varchar(256),
	"cron_timezone" varchar(64) DEFAULT 'UTC',
	"run_at" timestamp with time zone,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_run_at" timestamp with time zone,
	"claimed_at" timestamp with time zone,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trigger_schedules_tenant_id_scheduled_trigger_id_pk" PRIMARY KEY("tenant_id","scheduled_trigger_id")
);
--> statement-breakpoint
CREATE INDEX "trigger_schedules_dispatch_idx" ON "trigger_schedules" USING btree ("next_run_at") WHERE enabled = true AND claimed_at IS NULL;
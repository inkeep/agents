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
	"max_retries" integer DEFAULT 1 NOT NULL,
	"retry_delay_seconds" integer DEFAULT 60 NOT NULL,
	"timeout_seconds" integer DEFAULT 780 NOT NULL,
	"run_as_user_id" varchar(256),
	"created_by" varchar(256),
	"next_run_at" timestamp with time zone,
	"ref" varchar(256) DEFAULT 'main' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_triggers_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE TABLE "scheduler_state" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"current_run_id" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scheduled_triggers" ADD CONSTRAINT "scheduled_triggers_run_as_user_id_user_id_fk" FOREIGN KEY ("run_as_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "scheduled_triggers_agent_idx" ON "scheduled_triggers" USING btree ("tenant_id","project_id","agent_id");--> statement-breakpoint
CREATE INDEX "scheduled_triggers_ref_idx" ON "scheduled_triggers" USING btree ("ref");--> statement-breakpoint
CREATE INDEX "scheduled_triggers_next_run_at_idx" ON "scheduled_triggers" USING btree ("enabled","next_run_at");--> statement-breakpoint
ALTER TABLE "apps" DROP COLUMN "prompt";
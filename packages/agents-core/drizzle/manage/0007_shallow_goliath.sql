CREATE TABLE "scheduled_workflows" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"workflow_run_id" varchar(256),
	"scheduled_trigger_id" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "scheduled_workflows_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
);
--> statement-breakpoint
ALTER TABLE "scheduled_workflows" ADD CONSTRAINT "scheduled_workflows_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_workflows" ADD CONSTRAINT "scheduled_workflows_trigger_fk" FOREIGN KEY ("tenant_id","project_id","agent_id","scheduled_trigger_id") REFERENCES "public"."scheduled_triggers"("tenant_id","project_id","agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_triggers" DROP COLUMN "workflow_run_id";
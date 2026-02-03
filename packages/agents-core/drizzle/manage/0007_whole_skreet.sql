CREATE TABLE "work_app_configs" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"app_type" varchar(50) NOT NULL,
	"workspace_id" varchar(256) NOT NULL,
	"channel_id" varchar(256),
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "work_app_configs_tenant_id_id_pk" PRIMARY KEY("tenant_id","id"),
	CONSTRAINT "work_app_configs_workspace_channel_unique" UNIQUE("tenant_id","app_type","workspace_id","channel_id")
);
--> statement-breakpoint
ALTER TABLE "work_app_configs" ADD CONSTRAINT "work_app_configs_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;
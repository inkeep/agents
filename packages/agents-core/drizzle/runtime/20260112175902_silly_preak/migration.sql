CREATE TABLE "dataset_run" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"dataset_id" text NOT NULL,
	"dataset_run_config_id" text,
	"evaluation_job_config_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_run_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "dataset_run_conversation_relations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"dataset_run_id" text NOT NULL,
	"conversation_id" text NOT NULL,
	"dataset_item_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_run_conversation_relations_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id"),
	CONSTRAINT "dataset_run_conversation_relations_unique" UNIQUE("dataset_run_id","conversation_id")
);
--> statement-breakpoint
CREATE TABLE "evaluation_result" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"conversation_id" text NOT NULL,
	"evaluator_id" text NOT NULL,
	"evaluation_run_id" text,
	"output" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_result_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "evaluation_run" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"evaluation_job_config_id" text,
	"evaluation_run_config_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_run_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "project_metadata" (
	"id" varchar(256) NOT NULL,
	"tenant_id" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by" varchar(256),
	"main_branch_name" varchar(512) NOT NULL,
	CONSTRAINT "project_metadata_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
ALTER TABLE "agent" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "artifact_components" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "context_configs" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "credential_references" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "data_components" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "external_agents" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "function_tools" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "functions" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "projects" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sub_agent_artifact_components" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sub_agent_data_components" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sub_agent_external_agent_relations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sub_agent_function_tool_relations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sub_agent_relations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sub_agent_team_agent_relations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sub_agent_tool_relations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sub_agents" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tools" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "agent" CASCADE;--> statement-breakpoint
DROP TABLE "artifact_components" CASCADE;--> statement-breakpoint
DROP TABLE "context_configs" CASCADE;--> statement-breakpoint
DROP TABLE "credential_references" CASCADE;--> statement-breakpoint
DROP TABLE "data_components" CASCADE;--> statement-breakpoint
DROP TABLE "external_agents" CASCADE;--> statement-breakpoint
DROP TABLE "function_tools" CASCADE;--> statement-breakpoint
DROP TABLE "functions" CASCADE;--> statement-breakpoint
DROP TABLE "projects" CASCADE;--> statement-breakpoint
DROP TABLE "sub_agent_artifact_components" CASCADE;--> statement-breakpoint
DROP TABLE "sub_agent_data_components" CASCADE;--> statement-breakpoint
DROP TABLE "sub_agent_external_agent_relations" CASCADE;--> statement-breakpoint
DROP TABLE "sub_agent_function_tool_relations" CASCADE;--> statement-breakpoint
DROP TABLE "sub_agent_relations" CASCADE;--> statement-breakpoint
DROP TABLE "sub_agent_team_agent_relations" CASCADE;--> statement-breakpoint
DROP TABLE "sub_agent_tool_relations" CASCADE;--> statement-breakpoint
DROP TABLE "sub_agents" CASCADE;--> statement-breakpoint
DROP TABLE "tools" CASCADE;--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_project_fk";
--> statement-breakpoint
ALTER TABLE "api_keys" DROP CONSTRAINT IF EXISTS "api_keys_agent_fk";
--> statement-breakpoint
ALTER TABLE "context_cache" DROP CONSTRAINT IF EXISTS "context_cache_project_fk";
--> statement-breakpoint
ALTER TABLE "conversations" DROP CONSTRAINT IF EXISTS "conversations_project_fk";
--> statement-breakpoint
ALTER TABLE "ledger_artifacts" DROP CONSTRAINT IF EXISTS "ledger_artifacts_project_fk";
--> statement-breakpoint
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_project_fk";
--> statement-breakpoint
ALTER TABLE "task_relations" DROP CONSTRAINT IF EXISTS "task_relations_project_fk";
--> statement-breakpoint
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_sub_agent_fk";
--> statement-breakpoint
ALTER TABLE "context_cache" ADD COLUMN "ref" jsonb;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "agent_id" varchar(256);--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "ref" jsonb;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "ref" jsonb;--> statement-breakpoint
ALTER TABLE "dataset_run_conversation_relations" ADD CONSTRAINT "dataset_run_conversation_relations_run_fk" FOREIGN KEY ("tenant_id","project_id","dataset_run_id") REFERENCES "public"."dataset_run"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_conversation_relations" ADD CONSTRAINT "dataset_run_conversation_relations_conversation_fk" FOREIGN KEY ("tenant_id","project_id","conversation_id") REFERENCES "public"."conversations"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_result" ADD CONSTRAINT "evaluation_result_conversation_fk" FOREIGN KEY ("tenant_id","project_id","conversation_id") REFERENCES "public"."conversations"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_result" ADD CONSTRAINT "evaluation_result_evaluation_run_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_run_id") REFERENCES "public"."evaluation_run"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_metadata" ADD CONSTRAINT "project_metadata_organization_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_metadata_tenant_idx" ON "project_metadata" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "project_metadata_main_branch_idx" ON "project_metadata" USING btree ("main_branch_name");--> statement-breakpoint
ALTER TABLE "context_cache" ADD CONSTRAINT "context_cache_conversation_fk" FOREIGN KEY ("tenant_id","project_id","conversation_id") REFERENCES "public"."conversations"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_artifacts" ADD CONSTRAINT "ledger_artifacts_conversation_fk" FOREIGN KEY ("tenant_id","project_id","context_id") REFERENCES "public"."conversations"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_fk" FOREIGN KEY ("tenant_id","project_id","conversation_id") REFERENCES "public"."conversations"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_parent_fk" FOREIGN KEY ("tenant_id","project_id","parent_task_id") REFERENCES "public"."tasks"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_child_fk" FOREIGN KEY ("tenant_id","project_id","child_task_id") REFERENCES "public"."tasks"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_cache" DROP COLUMN "fetch_duration_ms";
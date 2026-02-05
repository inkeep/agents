CREATE TABLE "agent" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"default_sub_agent_id" varchar(256),
	"context_config_id" varchar(256),
	"models" jsonb,
	"status_updates" jsonb,
	"prompt" text,
	"stop_when" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "agent_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "artifact_components" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"props" jsonb,
	"render" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_components_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "context_configs" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"headers_schema" jsonb,
	"context_variables" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "context_configs_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
);
--> statement-breakpoint
CREATE TABLE "credential_references" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"type" varchar(256) NOT NULL,
	"credential_store_id" varchar(256) NOT NULL,
	"retrieval_params" jsonb,
	"tool_id" varchar(256),
	"user_id" varchar(256),
	"created_by" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credential_references_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id"),
	CONSTRAINT "credential_references_id_unique" UNIQUE("id"),
	CONSTRAINT "credential_references_tool_user_unique" UNIQUE("tool_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "data_components" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"props" jsonb,
	"render" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "data_components_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "dataset" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "dataset_item" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"dataset_id" varchar(256) NOT NULL,
	"input" jsonb NOT NULL,
	"expected_output" jsonb,
	"simulation_agent" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_item_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "dataset_run_config" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"dataset_id" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_run_config_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "dataset_run_config_agent_relations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"dataset_run_config_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_run_config_agent_relations_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "evaluation_job_config" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"job_filters" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_job_config_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "evaluation_job_config_evaluator_relations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"evaluation_job_config_id" varchar(256) NOT NULL,
	"evaluator_id" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "eval_job_cfg_evaluator_rel_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "evaluation_run_config" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_run_config_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "evaluation_run_config_evaluation_suite_config_relations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"evaluation_run_config_id" varchar(256) NOT NULL,
	"evaluation_suite_config_id" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "eval_run_cfg_eval_suite_cfg_rel_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "evaluation_suite_config" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"filters" jsonb,
	"sample_rate" double precision,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_suite_config_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "evaluation_suite_config_evaluator_relations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"evaluation_suite_config_id" varchar(256) NOT NULL,
	"evaluator_id" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "eval_suite_cfg_evaluator_rel_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "evaluator" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"prompt" text NOT NULL,
	"schema" jsonb NOT NULL,
	"model" jsonb NOT NULL,
	"pass_criteria" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evaluator_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "external_agents" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"base_url" text NOT NULL,
	"credential_reference_id" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "external_agents_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "function_tools" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"function_id" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "function_tools_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
);
--> statement-breakpoint
CREATE TABLE "functions" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"input_schema" jsonb,
	"execute_code" text NOT NULL,
	"dependencies" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "functions_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"models" jsonb,
	"stop_when" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
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
	"max_retries" numeric DEFAULT 3 NOT NULL,
	"retry_delay_seconds" numeric DEFAULT 60 NOT NULL,
	"timeout_seconds" numeric DEFAULT 300 NOT NULL,
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
CREATE TABLE "sub_agent_artifact_components" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"sub_agent_id" varchar(256) NOT NULL,
	"artifact_component_id" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sub_agent_artifact_components_pk" PRIMARY KEY("tenant_id","project_id","agent_id","sub_agent_id","id")
);
--> statement-breakpoint
CREATE TABLE "sub_agent_data_components" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"sub_agent_id" varchar(256) NOT NULL,
	"data_component_id" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sub_agent_data_components_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "sub_agent_external_agent_relations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"sub_agent_id" varchar(256) NOT NULL,
	"external_agent_id" varchar(256) NOT NULL,
	"headers" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sub_agent_external_agent_relations_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
);
--> statement-breakpoint
CREATE TABLE "sub_agent_function_tool_relations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"sub_agent_id" varchar(256) NOT NULL,
	"function_tool_id" varchar(256) NOT NULL,
	"tool_policies" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sub_agent_function_tool_relations_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
);
--> statement-breakpoint
CREATE TABLE "sub_agent_relations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"source_sub_agent_id" varchar(256) NOT NULL,
	"target_sub_agent_id" varchar(256),
	"relation_type" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sub_agent_relations_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
);
--> statement-breakpoint
CREATE TABLE "sub_agent_team_agent_relations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"sub_agent_id" varchar(256) NOT NULL,
	"target_agent_id" varchar(256) NOT NULL,
	"headers" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sub_agent_team_agent_relations_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
);
--> statement-breakpoint
CREATE TABLE "sub_agent_tool_relations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"sub_agent_id" varchar(256) NOT NULL,
	"tool_id" varchar(256) NOT NULL,
	"selected_tools" jsonb,
	"headers" jsonb,
	"tool_policies" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sub_agent_tool_relations_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
);
--> statement-breakpoint
CREATE TABLE "sub_agents" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"prompt" text,
	"conversation_history_config" jsonb DEFAULT '{"mode":"full","limit":50,"maxOutputTokens":4000,"includeInternal":false,"messageTypes":["chat","tool-result"]}'::jsonb,
	"models" jsonb,
	"stop_when" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sub_agents_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
);
--> statement-breakpoint
CREATE TABLE "tools" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"config" jsonb NOT NULL,
	"credential_reference_id" varchar(256),
	"credential_scope" varchar(50) DEFAULT 'project' NOT NULL,
	"headers" jsonb,
	"image_url" text,
	"capabilities" jsonb,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tools_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "triggers" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"enabled" boolean DEFAULT true NOT NULL,
	"input_schema" jsonb,
	"output_transform" jsonb,
	"message_template" text,
	"authentication" jsonb,
	"signing_secret_credential_reference_id" varchar(256),
	"signature_verification" jsonb DEFAULT 'null'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "triggers_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
);
--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_components" ADD CONSTRAINT "artifact_components_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_configs" ADD CONSTRAINT "context_configs_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_references" ADD CONSTRAINT "credential_references_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_components" ADD CONSTRAINT "data_components_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_item" ADD CONSTRAINT "dataset_item_dataset_fk" FOREIGN KEY ("tenant_id","project_id","dataset_id") REFERENCES "public"."dataset"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config" ADD CONSTRAINT "dataset_run_config_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config" ADD CONSTRAINT "dataset_run_config_dataset_fk" FOREIGN KEY ("tenant_id","project_id","dataset_id") REFERENCES "public"."dataset"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config_agent_relations" ADD CONSTRAINT "dataset_run_config_agent_relations_dataset_run_config_fk" FOREIGN KEY ("tenant_id","project_id","dataset_run_config_id") REFERENCES "public"."dataset_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config_agent_relations" ADD CONSTRAINT "dataset_run_config_agent_relations_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_job_config" ADD CONSTRAINT "evaluation_job_config_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_job_config_evaluator_relations" ADD CONSTRAINT "eval_job_cfg_evaluator_rel_job_cfg_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_job_config_id") REFERENCES "public"."evaluation_job_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_job_config_evaluator_relations" ADD CONSTRAINT "eval_job_cfg_evaluator_rel_evaluator_fk" FOREIGN KEY ("tenant_id","project_id","evaluator_id") REFERENCES "public"."evaluator"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_run_config" ADD CONSTRAINT "evaluation_run_config_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_run_config_evaluation_suite_config_relations" ADD CONSTRAINT "eval_run_cfg_eval_suite_rel_run_cfg_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_run_config_id") REFERENCES "public"."evaluation_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_run_config_evaluation_suite_config_relations" ADD CONSTRAINT "eval_run_cfg_eval_suite_rel_suite_cfg_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_suite_config_id") REFERENCES "public"."evaluation_suite_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_suite_config" ADD CONSTRAINT "evaluation_suite_config_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_suite_config_evaluator_relations" ADD CONSTRAINT "eval_suite_cfg_evaluator_rel_suite_cfg_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_suite_config_id") REFERENCES "public"."evaluation_suite_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_suite_config_evaluator_relations" ADD CONSTRAINT "eval_suite_cfg_evaluator_rel_evaluator_fk" FOREIGN KEY ("tenant_id","project_id","evaluator_id") REFERENCES "public"."evaluator"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluator" ADD CONSTRAINT "evaluator_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_agents" ADD CONSTRAINT "external_agents_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_agents" ADD CONSTRAINT "external_agents_credential_reference_fk" FOREIGN KEY ("credential_reference_id") REFERENCES "public"."credential_references"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "function_tools" ADD CONSTRAINT "function_tools_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "function_tools" ADD CONSTRAINT "function_tools_function_fk" FOREIGN KEY ("tenant_id","project_id","function_id") REFERENCES "public"."functions"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "functions" ADD CONSTRAINT "functions_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_triggers" ADD CONSTRAINT "scheduled_triggers_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_workflows" ADD CONSTRAINT "scheduled_workflows_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_workflows" ADD CONSTRAINT "scheduled_workflows_trigger_fk" FOREIGN KEY ("tenant_id","project_id","agent_id","scheduled_trigger_id") REFERENCES "public"."scheduled_triggers"("tenant_id","project_id","agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_agent_artifact_components" ADD CONSTRAINT "sub_agent_artifact_components_sub_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id","sub_agent_id") REFERENCES "public"."sub_agents"("tenant_id","project_id","agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_agent_artifact_components" ADD CONSTRAINT "sub_agent_artifact_components_artifact_component_fk" FOREIGN KEY ("tenant_id","project_id","artifact_component_id") REFERENCES "public"."artifact_components"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_agent_data_components" ADD CONSTRAINT "sub_agent_data_components_sub_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id","sub_agent_id") REFERENCES "public"."sub_agents"("tenant_id","project_id","agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_agent_data_components" ADD CONSTRAINT "sub_agent_data_components_data_component_fk" FOREIGN KEY ("tenant_id","project_id","data_component_id") REFERENCES "public"."data_components"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_agent_external_agent_relations" ADD CONSTRAINT "sub_agent_external_agent_relations_sub_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id","sub_agent_id") REFERENCES "public"."sub_agents"("tenant_id","project_id","agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_agent_external_agent_relations" ADD CONSTRAINT "sub_agent_external_agent_relations_external_agent_fk" FOREIGN KEY ("tenant_id","project_id","external_agent_id") REFERENCES "public"."external_agents"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_agent_function_tool_relations" ADD CONSTRAINT "sub_agent_function_tool_relations_sub_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id","sub_agent_id") REFERENCES "public"."sub_agents"("tenant_id","project_id","agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_agent_function_tool_relations" ADD CONSTRAINT "sub_agent_function_tool_relations_function_tool_fk" FOREIGN KEY ("tenant_id","project_id","agent_id","function_tool_id") REFERENCES "public"."function_tools"("tenant_id","project_id","agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_agent_relations" ADD CONSTRAINT "sub_agent_relations_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_agent_team_agent_relations" ADD CONSTRAINT "sub_agent_team_agent_relations_sub_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id","sub_agent_id") REFERENCES "public"."sub_agents"("tenant_id","project_id","agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_agent_team_agent_relations" ADD CONSTRAINT "sub_agent_team_agent_relations_target_agent_fk" FOREIGN KEY ("tenant_id","project_id","target_agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_agent_tool_relations" ADD CONSTRAINT "sub_agent_tool_relations_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id","sub_agent_id") REFERENCES "public"."sub_agents"("tenant_id","project_id","agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_agent_tool_relations" ADD CONSTRAINT "sub_agent_tool_relations_tool_fk" FOREIGN KEY ("tenant_id","project_id","tool_id") REFERENCES "public"."tools"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sub_agents" ADD CONSTRAINT "sub_agents_agents_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_credential_reference_fk" FOREIGN KEY ("credential_reference_id") REFERENCES "public"."credential_references"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_credential_reference_fk" FOREIGN KEY ("signing_secret_credential_reference_id") REFERENCES "public"."credential_references"("id") ON DELETE set null ON UPDATE no action;
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
CREATE TABLE "api_keys" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"public_id" varchar(256) NOT NULL,
	"key_hash" varchar(256) NOT NULL,
	"key_prefix" varchar(256) NOT NULL,
	"name" varchar(256),
	"last_used_at" timestamp,
	"expires_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "artifact_components" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text NOT NULL,
	"props" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "artifact_components_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "context_cache" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"conversation_id" varchar(256) NOT NULL,
	"context_config_id" varchar(256) NOT NULL,
	"context_variable_key" varchar(256) NOT NULL,
	"value" jsonb NOT NULL,
	"request_hash" varchar(256),
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"fetch_source" varchar(256),
	"fetch_duration_ms" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "context_cache_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
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
CREATE TABLE "conversations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"user_id" varchar(256),
	"active_sub_agent_id" varchar(256) NOT NULL,
	"title" text,
	"last_context_resolution" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
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
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "credential_references_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "data_components" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text NOT NULL,
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
	"description" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "dataset_item" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"dataset_id" text NOT NULL,
	"input" jsonb NOT NULL,
	"expected_output" jsonb,
	"simulation_agent" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_item_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "dataset_run" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"dataset_id" text NOT NULL,
	"dataset_run_config_id" text NOT NULL,
	"evaluation_job_config_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_run_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "dataset_run_config" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text NOT NULL,
	"dataset_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_run_config_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "dataset_run_config_agent_relations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"dataset_run_config_id" text NOT NULL,
	"agent_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_run_config_agent_relations_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "dataset_run_config_evaluation_run_config_relations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"dataset_run_config_id" text NOT NULL,
	"evaluation_run_config_id" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_run_config_evaluation_run_config_relations_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
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
	"evaluation_job_config_id" text NOT NULL,
	"evaluator_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_job_config_evaluator_relations_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
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
CREATE TABLE "evaluation_run_config" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text NOT NULL,
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
	"evaluation_run_config_id" text NOT NULL,
	"evaluation_suite_config_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_run_config_evaluation_suite_config_relations_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "evaluation_suite_config" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text NOT NULL,
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
	"evaluation_suite_config_id" text NOT NULL,
	"evaluator_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "evaluation_suite_config_evaluator_relations_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "evaluator" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text NOT NULL,
	"prompt" text NOT NULL,
	"schema" jsonb NOT NULL,
	"model" jsonb NOT NULL,
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
	"description" text NOT NULL,
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
CREATE TABLE "ledger_artifacts" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"task_id" varchar(256) NOT NULL,
	"tool_call_id" varchar(256),
	"context_id" varchar(256) NOT NULL,
	"type" varchar(256) DEFAULT 'source' NOT NULL,
	"name" varchar(256),
	"description" text,
	"parts" jsonb,
	"metadata" jsonb,
	"summary" text,
	"mime" jsonb,
	"visibility" varchar(256) DEFAULT 'context',
	"allowed_agents" jsonb,
	"derived_from" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_artifacts_tenant_id_project_id_id_task_id_pk" PRIMARY KEY("tenant_id","project_id","id","task_id"),
	CONSTRAINT "ledger_artifacts_task_context_name_unique" UNIQUE("task_id","context_id","name")
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"conversation_id" varchar(256) NOT NULL,
	"role" varchar(256) NOT NULL,
	"from_sub_agent_id" varchar(256),
	"to_sub_agent_id" varchar(256),
	"from_external_sub_agent_id" varchar(256),
	"to_external_sub_agent_id" varchar(256),
	"from_team_agent_id" varchar(256),
	"to_team_agent_id" varchar(256),
	"content" jsonb NOT NULL,
	"visibility" varchar(256) DEFAULT 'user-facing' NOT NULL,
	"message_type" varchar(256) DEFAULT 'chat' NOT NULL,
	"task_id" varchar(256),
	"parent_message_id" varchar(256),
	"a2a_task_id" varchar(256),
	"a2a_session_id" varchar(256),
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "messages_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text NOT NULL,
	"models" jsonb,
	"stop_when" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "projects_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
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
	CONSTRAINT "sub_agent_artifact_components_tenant_id_project_id_agent_id_sub_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","sub_agent_id","id")
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
	CONSTRAINT "sub_agent_external_agent_relations_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
);
--> statement-breakpoint
CREATE TABLE "sub_agent_function_tool_relations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"sub_agent_id" varchar(256) NOT NULL,
	"function_tool_id" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sub_agent_function_tool_relations_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
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
	CONSTRAINT "sub_agent_team_agent_relations_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
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
	"description" text NOT NULL,
	"prompt" text NOT NULL,
	"conversation_history_config" jsonb DEFAULT '{"mode":"full","limit":50,"maxOutputTokens":4000,"includeInternal":false,"messageTypes":["chat","tool-result"]}'::jsonb NOT NULL,
	"models" jsonb,
	"stop_when" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sub_agents_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
);
--> statement-breakpoint
CREATE TABLE "task_relations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"parent_task_id" varchar(256) NOT NULL,
	"child_task_id" varchar(256) NOT NULL,
	"relation_type" varchar(256) DEFAULT 'parent_child',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "task_relations_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"sub_agent_id" varchar(256) NOT NULL,
	"context_id" varchar(256) NOT NULL,
	"status" varchar(256) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
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
	"headers" jsonb,
	"image_url" text,
	"capabilities" jsonb,
	"last_error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tools_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
ALTER TABLE "agent" ADD CONSTRAINT "agent_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "artifact_components" ADD CONSTRAINT "artifact_components_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_cache" ADD CONSTRAINT "context_cache_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_configs" ADD CONSTRAINT "context_configs_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credential_references" ADD CONSTRAINT "credential_references_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_components" ADD CONSTRAINT "data_components_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_item" ADD CONSTRAINT "dataset_item_dataset_fk" FOREIGN KEY ("tenant_id","project_id","dataset_id") REFERENCES "public"."dataset"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run" ADD CONSTRAINT "dataset_run_dataset_fk" FOREIGN KEY ("tenant_id","project_id","dataset_id") REFERENCES "public"."dataset"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run" ADD CONSTRAINT "dataset_run_dataset_run_config_fk" FOREIGN KEY ("tenant_id","project_id","dataset_run_config_id") REFERENCES "public"."dataset_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run" ADD CONSTRAINT "dataset_run_evaluation_job_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_job_config_id") REFERENCES "public"."evaluation_job_config"("tenant_id","project_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config" ADD CONSTRAINT "dataset_run_config_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config" ADD CONSTRAINT "dataset_run_config_dataset_fk" FOREIGN KEY ("tenant_id","project_id","dataset_id") REFERENCES "public"."dataset"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config_agent_relations" ADD CONSTRAINT "dataset_run_config_agent_relations_dataset_run_config_fk" FOREIGN KEY ("tenant_id","project_id","dataset_run_config_id") REFERENCES "public"."dataset_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config_agent_relations" ADD CONSTRAINT "dataset_run_config_agent_relations_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config_evaluation_run_config_relations" ADD CONSTRAINT "dataset_run_config_evaluation_run_config_relations_dataset_run_config_fk" FOREIGN KEY ("tenant_id","project_id","dataset_run_config_id") REFERENCES "public"."dataset_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config_evaluation_run_config_relations" ADD CONSTRAINT "dataset_run_config_evaluation_run_config_relations_evaluation_run_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_run_config_id") REFERENCES "public"."evaluation_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_conversation_relations" ADD CONSTRAINT "dataset_run_conversation_relations_run_fk" FOREIGN KEY ("tenant_id","project_id","dataset_run_id") REFERENCES "public"."dataset_run"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_conversation_relations" ADD CONSTRAINT "dataset_run_conversation_relations_conversation_fk" FOREIGN KEY ("tenant_id","project_id","conversation_id") REFERENCES "public"."conversations"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_conversation_relations" ADD CONSTRAINT "dataset_run_conversation_relations_item_fk" FOREIGN KEY ("tenant_id","project_id","dataset_item_id") REFERENCES "public"."dataset_item"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_job_config" ADD CONSTRAINT "evaluation_job_config_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_job_config_evaluator_relations" ADD CONSTRAINT "evaluation_job_config_evaluator_relations_evaluation_job_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_job_config_id") REFERENCES "public"."evaluation_job_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_job_config_evaluator_relations" ADD CONSTRAINT "evaluation_job_config_evaluator_relations_evaluator_fk" FOREIGN KEY ("tenant_id","project_id","evaluator_id") REFERENCES "public"."evaluator"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_result" ADD CONSTRAINT "evaluation_result_conversation_fk" FOREIGN KEY ("tenant_id","project_id","conversation_id") REFERENCES "public"."conversations"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_result" ADD CONSTRAINT "evaluation_result_evaluator_fk" FOREIGN KEY ("tenant_id","project_id","evaluator_id") REFERENCES "public"."evaluator"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_result" ADD CONSTRAINT "evaluation_result_evaluation_run_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_run_id") REFERENCES "public"."evaluation_run"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_run" ADD CONSTRAINT "evaluation_run_evaluation_job_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_job_config_id") REFERENCES "public"."evaluation_job_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_run" ADD CONSTRAINT "evaluation_run_evaluation_run_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_run_config_id") REFERENCES "public"."evaluation_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_run_config" ADD CONSTRAINT "evaluation_run_config_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_run_config_evaluation_suite_config_relations" ADD CONSTRAINT "eval_run_config_eval_suite_rel_run_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_run_config_id") REFERENCES "public"."evaluation_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_run_config_evaluation_suite_config_relations" ADD CONSTRAINT "eval_run_config_eval_suite_rel_suite_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_suite_config_id") REFERENCES "public"."evaluation_suite_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_suite_config" ADD CONSTRAINT "evaluation_suite_config_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_suite_config_evaluator_relations" ADD CONSTRAINT "evaluation_suite_config_evaluator_relations_evaluation_suite_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_suite_config_id") REFERENCES "public"."evaluation_suite_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_suite_config_evaluator_relations" ADD CONSTRAINT "evaluation_suite_config_evaluator_relations_evaluator_fk" FOREIGN KEY ("tenant_id","project_id","evaluator_id") REFERENCES "public"."evaluator"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluator" ADD CONSTRAINT "evaluator_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_agents" ADD CONSTRAINT "external_agents_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_agents" ADD CONSTRAINT "external_agents_credential_reference_fk" FOREIGN KEY ("tenant_id","project_id","credential_reference_id") REFERENCES "public"."credential_references"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "function_tools" ADD CONSTRAINT "function_tools_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "function_tools" ADD CONSTRAINT "function_tools_function_fk" FOREIGN KEY ("tenant_id","project_id","function_id") REFERENCES "public"."functions"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "functions" ADD CONSTRAINT "functions_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_artifacts" ADD CONSTRAINT "ledger_artifacts_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
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
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sub_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id","sub_agent_id") REFERENCES "public"."sub_agents"("tenant_id","project_id","agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "api_keys_tenant_agent_idx" ON "api_keys" USING btree ("tenant_id","agent_id");--> statement-breakpoint
CREATE INDEX "api_keys_prefix_idx" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "api_keys_public_id_idx" ON "api_keys" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "context_cache_lookup_idx" ON "context_cache" USING btree ("conversation_id","context_config_id","context_variable_key");--> statement-breakpoint
CREATE INDEX "ledger_artifacts_task_id_idx" ON "ledger_artifacts" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "ledger_artifacts_tool_call_id_idx" ON "ledger_artifacts" USING btree ("tool_call_id");--> statement-breakpoint
CREATE INDEX "ledger_artifacts_context_id_idx" ON "ledger_artifacts" USING btree ("context_id");
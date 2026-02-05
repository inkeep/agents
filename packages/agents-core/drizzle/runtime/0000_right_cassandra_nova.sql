CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL
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
CREATE TABLE "context_cache" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"conversation_id" varchar(256) NOT NULL,
	"context_config_id" varchar(256) NOT NULL,
	"context_variable_key" varchar(256) NOT NULL,
	"ref" jsonb,
	"value" jsonb NOT NULL,
	"request_hash" varchar(256),
	"fetched_at" timestamp DEFAULT now() NOT NULL,
	"fetch_source" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "context_cache_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"user_id" varchar(256),
	"agent_id" varchar(256),
	"active_sub_agent_id" varchar(256) NOT NULL,
	"ref" jsonb,
	"title" text,
	"last_context_resolution" timestamp,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "conversations_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
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
CREATE TABLE "device_code" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code" text NOT NULL,
	"user_code" text NOT NULL,
	"user_id" text,
	"expires_at" timestamp NOT NULL,
	"status" text NOT NULL,
	"last_polled_at" timestamp,
	"polling_interval" integer,
	"client_id" text,
	"scope" text
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
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"inviter_id" text NOT NULL
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
CREATE TABLE "member" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"created_at" timestamp NOT NULL
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
CREATE TABLE "organization" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"logo" text,
	"created_at" timestamp NOT NULL,
	"metadata" text,
	CONSTRAINT "organization_slug_unique" UNIQUE("slug")
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
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"active_organization_id" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "sso_provider" (
	"id" text PRIMARY KEY NOT NULL,
	"issuer" text NOT NULL,
	"oidc_config" text,
	"saml_config" text,
	"user_id" text,
	"provider_id" text NOT NULL,
	"organization_id" text,
	"domain" text NOT NULL,
	CONSTRAINT "sso_provider_provider_id_unique" UNIQUE("provider_id")
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
	"ref" jsonb,
	"status" varchar(256) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "trigger_invocations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"trigger_id" varchar(256) NOT NULL,
	"conversation_id" varchar(256),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"request_payload" jsonb NOT NULL,
	"transformed_payload" jsonb,
	"error_message" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "trigger_invocations_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_organization_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_cache" ADD CONSTRAINT "context_cache_conversation_fk" FOREIGN KEY ("tenant_id","project_id","conversation_id") REFERENCES "public"."conversations"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_conversation_relations" ADD CONSTRAINT "dataset_run_conversation_relations_run_fk" FOREIGN KEY ("tenant_id","project_id","dataset_run_id") REFERENCES "public"."dataset_run"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_conversation_relations" ADD CONSTRAINT "dataset_run_conversation_relations_conversation_fk" FOREIGN KEY ("tenant_id","project_id","conversation_id") REFERENCES "public"."conversations"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_result" ADD CONSTRAINT "evaluation_result_conversation_fk" FOREIGN KEY ("tenant_id","project_id","conversation_id") REFERENCES "public"."conversations"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_result" ADD CONSTRAINT "evaluation_result_evaluation_run_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_run_id") REFERENCES "public"."evaluation_run"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_inviter_id_user_id_fk" FOREIGN KEY ("inviter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_artifacts" ADD CONSTRAINT "ledger_artifacts_conversation_fk" FOREIGN KEY ("tenant_id","project_id","context_id") REFERENCES "public"."conversations"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_fk" FOREIGN KEY ("tenant_id","project_id","conversation_id") REFERENCES "public"."conversations"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_metadata" ADD CONSTRAINT "project_metadata_organization_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sso_provider" ADD CONSTRAINT "sso_provider_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_parent_fk" FOREIGN KEY ("tenant_id","project_id","parent_task_id") REFERENCES "public"."tasks"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_relations" ADD CONSTRAINT "task_relations_child_fk" FOREIGN KEY ("tenant_id","project_id","child_task_id") REFERENCES "public"."tasks"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_userId_idx" ON "account" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "api_keys_tenant_agent_idx" ON "api_keys" USING btree ("tenant_id","agent_id");--> statement-breakpoint
CREATE INDEX "api_keys_prefix_idx" ON "api_keys" USING btree ("key_prefix");--> statement-breakpoint
CREATE INDEX "api_keys_public_id_idx" ON "api_keys" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "context_cache_lookup_idx" ON "context_cache" USING btree ("conversation_id","context_config_id","context_variable_key");--> statement-breakpoint
CREATE INDEX "invitation_organizationId_idx" ON "invitation" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "invitation_email_idx" ON "invitation" USING btree ("email");--> statement-breakpoint
CREATE INDEX "ledger_artifacts_task_id_idx" ON "ledger_artifacts" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "ledger_artifacts_tool_call_id_idx" ON "ledger_artifacts" USING btree ("tool_call_id");--> statement-breakpoint
CREATE INDEX "ledger_artifacts_context_id_idx" ON "ledger_artifacts" USING btree ("context_id");--> statement-breakpoint
CREATE INDEX "member_organizationId_idx" ON "member" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "member_userId_idx" ON "member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "project_metadata_tenant_idx" ON "project_metadata" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "project_metadata_main_branch_idx" ON "project_metadata" USING btree ("main_branch_name");--> statement-breakpoint
CREATE UNIQUE INDEX "sched_invocations_idempotency_idx" ON "scheduled_trigger_invocations" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "session_userId_idx" ON "session" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trigger_invocations_trigger_idx" ON "trigger_invocations" USING btree ("trigger_id","created_at");--> statement-breakpoint
CREATE INDEX "trigger_invocations_status_idx" ON "trigger_invocations" USING btree ("trigger_id","status");--> statement-breakpoint
CREATE INDEX "verification_identifier_idx" ON "verification" USING btree ("identifier");
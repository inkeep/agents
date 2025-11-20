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
	"input" jsonb,
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
	"run_frequency" text NOT NULL,
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
CREATE TABLE "dataset_run_config_evaluation_suite_config_relations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"dataset_run_config_id" text NOT NULL,
	"evaluation_suite_config_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_run_config_evaluation_suite_config_relations_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
CREATE TABLE "dataset_run_conversation_relations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"dataset_run_id" text NOT NULL,
	"conversation_id" text NOT NULL,
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
	"run_frequency" text NOT NULL,
	"time_window" text NOT NULL,
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
ALTER TABLE "dataset" ADD CONSTRAINT "dataset_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_item" ADD CONSTRAINT "dataset_item_dataset_fk" FOREIGN KEY ("tenant_id","project_id","dataset_id") REFERENCES "public"."dataset"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run" ADD CONSTRAINT "dataset_run_dataset_fk" FOREIGN KEY ("tenant_id","project_id","dataset_id") REFERENCES "public"."dataset"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run" ADD CONSTRAINT "dataset_run_dataset_run_config_fk" FOREIGN KEY ("tenant_id","project_id","dataset_run_config_id") REFERENCES "public"."dataset_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config" ADD CONSTRAINT "dataset_run_config_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config" ADD CONSTRAINT "dataset_run_config_dataset_fk" FOREIGN KEY ("tenant_id","project_id","dataset_id") REFERENCES "public"."dataset"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config_agent_relations" ADD CONSTRAINT "dataset_run_config_agent_relations_dataset_run_config_fk" FOREIGN KEY ("tenant_id","project_id","dataset_run_config_id") REFERENCES "public"."dataset_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config_agent_relations" ADD CONSTRAINT "dataset_run_config_agent_relations_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config_evaluation_suite_config_relations" ADD CONSTRAINT "dataset_run_config_evaluation_suite_config_relations_dataset_run_config_fk" FOREIGN KEY ("tenant_id","project_id","dataset_run_config_id") REFERENCES "public"."dataset_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config_evaluation_suite_config_relations" ADD CONSTRAINT "dataset_run_config_evaluation_suite_config_relations_evaluation_suite_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_suite_config_id") REFERENCES "public"."evaluation_suite_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_conversation_relations" ADD CONSTRAINT "dataset_run_conversation_relations_run_fk" FOREIGN KEY ("tenant_id","project_id","dataset_run_id") REFERENCES "public"."dataset_run"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_conversation_relations" ADD CONSTRAINT "dataset_run_conversation_relations_conversation_fk" FOREIGN KEY ("tenant_id","project_id","conversation_id") REFERENCES "public"."conversations"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_job_config" ADD CONSTRAINT "evaluation_job_config_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_job_config_evaluator_relations" ADD CONSTRAINT "evaluation_job_config_evaluator_relations_evaluation_job_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_job_config_id") REFERENCES "public"."evaluation_job_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_job_config_evaluator_relations" ADD CONSTRAINT "evaluation_job_config_evaluator_relations_evaluator_fk" FOREIGN KEY ("tenant_id","project_id","evaluator_id") REFERENCES "public"."evaluator"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_result" ADD CONSTRAINT "evaluation_result_conversation_fk" FOREIGN KEY ("tenant_id","project_id","conversation_id") REFERENCES "public"."conversations"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_result" ADD CONSTRAINT "evaluation_result_evaluator_fk" FOREIGN KEY ("tenant_id","project_id","evaluator_id") REFERENCES "public"."evaluator"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_result" ADD CONSTRAINT "evaluation_result_evaluation_run_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_run_id") REFERENCES "public"."evaluation_run"("tenant_id","project_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_run" ADD CONSTRAINT "evaluation_run_evaluation_job_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_job_config_id") REFERENCES "public"."evaluation_job_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_run" ADD CONSTRAINT "evaluation_run_evaluation_run_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_run_config_id") REFERENCES "public"."evaluation_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_run_config" ADD CONSTRAINT "evaluation_run_config_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_run_config_evaluation_suite_config_relations" ADD CONSTRAINT "evaluation_run_config_evaluation_suite_config_relations_evaluation_run_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_run_config_id") REFERENCES "public"."evaluation_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname LIKE 'evaluation_run_config_evaluation_suite_config_relations_evaluat%'
    AND conrelid = 'evaluation_run_config_evaluation_suite_config_relations'::regclass
  ) THEN
    ALTER TABLE "evaluation_run_config_evaluation_suite_config_relations" ADD CONSTRAINT "evaluation_run_config_evaluation_suite_config_relations_evaluation_suite_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_suite_config_id") REFERENCES "public"."evaluation_suite_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint
ALTER TABLE "evaluation_suite_config" ADD CONSTRAINT "evaluation_suite_config_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_suite_config_evaluator_relations" ADD CONSTRAINT "evaluation_suite_config_evaluator_relations_evaluation_suite_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_suite_config_id") REFERENCES "public"."evaluation_suite_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_suite_config_evaluator_relations" ADD CONSTRAINT "evaluation_suite_config_evaluator_relations_evaluator_fk" FOREIGN KEY ("tenant_id","project_id","evaluator_id") REFERENCES "public"."evaluator"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluator" ADD CONSTRAINT "evaluator_project_fk" FOREIGN KEY ("tenant_id","project_id") REFERENCES "public"."projects"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_item" ALTER COLUMN "input" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset_run_config" ALTER COLUMN "run_frequency" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset_run_config_evaluation_suite_config_relations" RENAME TO "dataset_run_config_evaluation_run_config_relations";--> statement-breakpoint
ALTER TABLE "dataset_run_config_evaluation_run_config_relations" RENAME COLUMN "evaluation_suite_config_id" TO "evaluation_run_config_id";--> statement-breakpoint
ALTER TABLE "dataset_run_config_evaluation_run_config_relations" DROP CONSTRAINT "dataset_run_config_evaluation_suite_config_relations_dataset_run_config_fk";
--> statement-breakpoint
ALTER TABLE "dataset_run_config_evaluation_run_config_relations" DROP CONSTRAINT "dataset_run_config_evaluation_suite_config_relations_evaluation_suite_config_fk";
--> statement-breakpoint
ALTER TABLE "dataset_run_config_evaluation_run_config_relations" DROP CONSTRAINT "dataset_run_config_evaluation_suite_config_relations_tenant_id_project_id_id_pk";--> statement-breakpoint
ALTER TABLE "dataset_run_config_evaluation_run_config_relations" ADD CONSTRAINT "dataset_run_config_evaluation_run_config_relations_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id");--> statement-breakpoint
ALTER TABLE "dataset_run_config_evaluation_run_config_relations" ADD CONSTRAINT "dataset_run_config_evaluation_run_config_relations_dataset_run_config_fk" FOREIGN KEY ("tenant_id","project_id","dataset_run_config_id") REFERENCES "public"."dataset_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config_evaluation_run_config_relations" ADD CONSTRAINT "dataset_run_config_evaluation_run_config_relations_evaluation_run_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_run_config_id") REFERENCES "public"."evaluation_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_run_config" DROP COLUMN "run_frequency";--> statement-breakpoint
ALTER TABLE "evaluation_run_config" DROP COLUMN "time_window";--> statement-breakpoint
ALTER TABLE "evaluation_run_config" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset_run_config_evaluation_run_config_relations" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluation_run_config" ADD COLUMN "exclude_dataset_run_conversations" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset_run_conversation_relations" ADD COLUMN "dataset_item_id" text;--> statement-breakpoint
DELETE FROM "dataset_run_conversation_relations" WHERE "dataset_item_id" IS NULL;--> statement-breakpoint
ALTER TABLE "dataset_run_conversation_relations" ALTER COLUMN "dataset_item_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset_run_conversation_relations" ADD CONSTRAINT "dataset_run_conversation_relations_item_fk" FOREIGN KEY ("tenant_id","project_id","dataset_item_id") REFERENCES "public"."dataset_item"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_result" DROP CONSTRAINT "evaluation_result_evaluation_run_fk";
--> statement-breakpoint
ALTER TABLE "evaluation_result" ADD CONSTRAINT "evaluation_result_evaluation_run_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_run_id") REFERENCES "public"."evaluation_run"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_run_config" DROP COLUMN "exclude_dataset_run_conversations";--> statement-breakpoint
ALTER TABLE "dataset_run" ADD COLUMN "evaluation_job_config_id" text;--> statement-breakpoint
ALTER TABLE "dataset_run" ADD CONSTRAINT "dataset_run_evaluation_job_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_job_config_id") REFERENCES "public"."evaluation_job_config"("tenant_id","project_id","id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint

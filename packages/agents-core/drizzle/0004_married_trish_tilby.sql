DROP TABLE IF EXISTS "dataset_run_config_evaluation_suite_config_relations" CASCADE;--> statement-breakpoint

-- Drop constraints if they exist
ALTER TABLE "evaluation_result" DROP CONSTRAINT IF EXISTS "evaluation_result_evaluation_run_fk";--> statement-breakpoint
ALTER TABLE "evaluation_run_config_evaluation_suite_config_relations" DROP CONSTRAINT IF EXISTS "evaluation_run_config_evaluation_suite_config_relations_evaluation_run_config_fk";--> statement-breakpoint
ALTER TABLE "evaluation_run_config_evaluation_suite_config_relations" DROP CONSTRAINT IF EXISTS "evaluation_run_config_evaluation_suite_config_relations_evaluation_suite_config_fk";--> statement-breakpoint

-- Make description columns nullable (idempotent)
ALTER TABLE "artifact_components" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "data_components" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "dataset_run_config" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluation_run_config" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "evaluator" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "external_agents" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_agents" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_agents" ALTER COLUMN "conversation_history_config" SET DEFAULT '{"mode":"full","limit":50,"maxOutputTokens":4000,"includeInternal":false,"messageTypes":["chat","tool-result"]}'::jsonb;--> statement-breakpoint

-- Add columns if they don't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dataset_run' AND column_name = 'evaluation_job_config_id') THEN
    ALTER TABLE "dataset_run" ADD COLUMN "evaluation_job_config_id" text;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dataset_run_conversation_relations' AND column_name = 'dataset_item_id') THEN
    ALTER TABLE "dataset_run_conversation_relations" ADD COLUMN "dataset_item_id" text;
  END IF;
END $$;--> statement-breakpoint

-- Note: agent_id is NOT added to dataset_run_conversation_relations
-- It is extracted at query time from conversation → subAgent → agentId chain
-- This is consistent with how evaluation results handle agent ID extraction

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluation_run_config' AND column_name = 'is_active') THEN
    ALTER TABLE "evaluation_run_config" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluator' AND column_name = 'pass_criteria') THEN
    ALTER TABLE "evaluator" ADD COLUMN "pass_criteria" jsonb;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'sub_agent_tool_relations' AND column_name = 'tool_policies') THEN
    ALTER TABLE "sub_agent_tool_relations" ADD COLUMN "tool_policies" jsonb;
  END IF;
END $$;--> statement-breakpoint

-- Add foreign key constraints if they don't exist
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'dataset_run_evaluation_job_config_fk') THEN
    ALTER TABLE "dataset_run" ADD CONSTRAINT "dataset_run_evaluation_job_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_job_config_id") REFERENCES "public"."evaluation_job_config"("tenant_id","project_id","id") ON DELETE set null ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'dataset_run_conversation_relations_item_fk') THEN
    ALTER TABLE "dataset_run_conversation_relations" ADD CONSTRAINT "dataset_run_conversation_relations_item_fk" FOREIGN KEY ("tenant_id","project_id","dataset_item_id") REFERENCES "public"."dataset_item"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'evaluation_result_evaluation_run_fk') THEN
    ALTER TABLE "evaluation_result" ADD CONSTRAINT "evaluation_result_evaluation_run_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_run_id") REFERENCES "public"."evaluation_run"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'eval_run_config_eval_suite_rel_run_config_fk') THEN
    ALTER TABLE "evaluation_run_config_evaluation_suite_config_relations" ADD CONSTRAINT "eval_run_config_eval_suite_rel_run_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_run_config_id") REFERENCES "public"."evaluation_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'eval_run_config_eval_suite_rel_suite_config_fk') THEN
    ALTER TABLE "evaluation_run_config_evaluation_suite_config_relations" ADD CONSTRAINT "eval_run_config_eval_suite_rel_suite_config_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_suite_config_id") REFERENCES "public"."evaluation_suite_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;
  END IF;
END $$;--> statement-breakpoint

-- Drop columns if they exist
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'dataset_run_config' AND column_name = 'run_frequency') THEN
    ALTER TABLE "dataset_run_config" DROP COLUMN "run_frequency";
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluation_run_config' AND column_name = 'run_frequency') THEN
    ALTER TABLE "evaluation_run_config" DROP COLUMN "run_frequency";
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluation_run_config' AND column_name = 'time_window') THEN
    ALTER TABLE "evaluation_run_config" DROP COLUMN "time_window";
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluation_suite_config' AND column_name = 'name') THEN
    ALTER TABLE "evaluation_suite_config" DROP COLUMN "name";
  END IF;
END $$;--> statement-breakpoint

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'evaluation_suite_config' AND column_name = 'description') THEN
    ALTER TABLE "evaluation_suite_config" DROP COLUMN "description";
  END IF;
END $$;

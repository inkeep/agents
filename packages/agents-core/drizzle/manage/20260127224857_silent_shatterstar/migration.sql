-- =============================================
-- 1. dataset_item.dataset_id
-- =============================================
ALTER TABLE "dataset_item" DROP CONSTRAINT "dataset_item_dataset_fk";--> statement-breakpoint
ALTER TABLE "dataset_item" ALTER COLUMN "dataset_id" SET DATA TYPE varchar(256);--> statement-breakpoint
ALTER TABLE "dataset_item" ADD CONSTRAINT "dataset_item_dataset_fk" FOREIGN KEY ("tenant_id","project_id","dataset_id") REFERENCES "public"."dataset"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- =============================================
-- 2. dataset_run_config.dataset_id
-- =============================================
ALTER TABLE "dataset_run_config" DROP CONSTRAINT "dataset_run_config_dataset_fk";--> statement-breakpoint
ALTER TABLE "dataset_run_config" ALTER COLUMN "dataset_id" SET DATA TYPE varchar(256);--> statement-breakpoint
ALTER TABLE "dataset_run_config" ADD CONSTRAINT "dataset_run_config_dataset_fk" FOREIGN KEY ("tenant_id","project_id","dataset_id") REFERENCES "public"."dataset"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- =============================================
-- 3. dataset_run_config_agent_relations (2 columns)
-- =============================================
ALTER TABLE "dataset_run_config_agent_relations" DROP CONSTRAINT "dataset_run_config_agent_relations_dataset_run_config_fk";--> statement-breakpoint
ALTER TABLE "dataset_run_config_agent_relations" DROP CONSTRAINT "dataset_run_config_agent_relations_agent_fk";--> statement-breakpoint
ALTER TABLE "dataset_run_config_agent_relations" ALTER COLUMN "dataset_run_config_id" SET DATA TYPE varchar(256);--> statement-breakpoint
ALTER TABLE "dataset_run_config_agent_relations" ALTER COLUMN "agent_id" SET DATA TYPE varchar(256);--> statement-breakpoint
ALTER TABLE "dataset_run_config_agent_relations" ADD CONSTRAINT "dataset_run_config_agent_relations_dataset_run_config_fk" FOREIGN KEY ("tenant_id","project_id","dataset_run_config_id") REFERENCES "public"."dataset_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config_agent_relations" ADD CONSTRAINT "dataset_run_config_agent_relations_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- =============================================
-- 4. evaluation_job_config_evaluator_relations (2 columns)
-- =============================================
ALTER TABLE "evaluation_job_config_evaluator_relations" DROP CONSTRAINT "eval_job_cfg_evaluator_rel_job_cfg_fk";--> statement-breakpoint
ALTER TABLE "evaluation_job_config_evaluator_relations" DROP CONSTRAINT "eval_job_cfg_evaluator_rel_evaluator_fk";--> statement-breakpoint
ALTER TABLE "evaluation_job_config_evaluator_relations" ALTER COLUMN "evaluation_job_config_id" SET DATA TYPE varchar(256);--> statement-breakpoint
ALTER TABLE "evaluation_job_config_evaluator_relations" ALTER COLUMN "evaluator_id" SET DATA TYPE varchar(256);--> statement-breakpoint
ALTER TABLE "evaluation_job_config_evaluator_relations" ADD CONSTRAINT "eval_job_cfg_evaluator_rel_job_cfg_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_job_config_id") REFERENCES "public"."evaluation_job_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_job_config_evaluator_relations" ADD CONSTRAINT "eval_job_cfg_evaluator_rel_evaluator_fk" FOREIGN KEY ("tenant_id","project_id","evaluator_id") REFERENCES "public"."evaluator"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- =============================================
-- 5. evaluation_run_config_evaluation_suite_config_relations (2 columns)
-- =============================================
ALTER TABLE "evaluation_run_config_evaluation_suite_config_relations" DROP CONSTRAINT "eval_run_cfg_eval_suite_rel_run_cfg_fk";--> statement-breakpoint
ALTER TABLE "evaluation_run_config_evaluation_suite_config_relations" DROP CONSTRAINT "eval_run_cfg_eval_suite_rel_suite_cfg_fk";--> statement-breakpoint
ALTER TABLE "evaluation_run_config_evaluation_suite_config_relations" ALTER COLUMN "evaluation_run_config_id" SET DATA TYPE varchar(256);--> statement-breakpoint
ALTER TABLE "evaluation_run_config_evaluation_suite_config_relations" ALTER COLUMN "evaluation_suite_config_id" SET DATA TYPE varchar(256);--> statement-breakpoint
ALTER TABLE "evaluation_run_config_evaluation_suite_config_relations" ADD CONSTRAINT "eval_run_cfg_eval_suite_rel_run_cfg_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_run_config_id") REFERENCES "public"."evaluation_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_run_config_evaluation_suite_config_relations" ADD CONSTRAINT "eval_run_cfg_eval_suite_rel_suite_cfg_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_suite_config_id") REFERENCES "public"."evaluation_suite_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint

-- =============================================
-- 6. evaluation_suite_config_evaluator_relations (2 columns)
-- =============================================
ALTER TABLE "evaluation_suite_config_evaluator_relations" DROP CONSTRAINT "eval_suite_cfg_evaluator_rel_suite_cfg_fk";--> statement-breakpoint
ALTER TABLE "evaluation_suite_config_evaluator_relations" DROP CONSTRAINT "eval_suite_cfg_evaluator_rel_evaluator_fk";--> statement-breakpoint
ALTER TABLE "evaluation_suite_config_evaluator_relations" ALTER COLUMN "evaluation_suite_config_id" SET DATA TYPE varchar(256);--> statement-breakpoint
ALTER TABLE "evaluation_suite_config_evaluator_relations" ALTER COLUMN "evaluator_id" SET DATA TYPE varchar(256);--> statement-breakpoint
ALTER TABLE "evaluation_suite_config_evaluator_relations" ADD CONSTRAINT "eval_suite_cfg_evaluator_rel_suite_cfg_fk" FOREIGN KEY ("tenant_id","project_id","evaluation_suite_config_id") REFERENCES "public"."evaluation_suite_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "evaluation_suite_config_evaluator_relations" ADD CONSTRAINT "eval_suite_cfg_evaluator_rel_evaluator_fk" FOREIGN KEY ("tenant_id","project_id","evaluator_id") REFERENCES "public"."evaluator"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;

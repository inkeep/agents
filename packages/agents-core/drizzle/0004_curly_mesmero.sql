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
ALTER TABLE "evaluation_run_config" DROP COLUMN "time_window";
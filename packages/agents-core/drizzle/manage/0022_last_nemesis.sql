CREATE TABLE "dataset_run_config_evaluator_relations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"dataset_run_config_id" varchar(256) NOT NULL,
	"evaluator_id" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "drc_evaluator_rel_pk" PRIMARY KEY("tenant_id","project_id","id"),
	CONSTRAINT "drc_evaluator_unique" UNIQUE("tenant_id","project_id","dataset_run_config_id","evaluator_id")
);
--> statement-breakpoint
ALTER TABLE "dataset_run_config" ADD COLUMN "dispatch_delay_ms" integer;--> statement-breakpoint
ALTER TABLE "dataset_run_config_evaluator_relations" ADD CONSTRAINT "drc_evaluator_rel_config_fk" FOREIGN KEY ("tenant_id","project_id","dataset_run_config_id") REFERENCES "public"."dataset_run_config"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dataset_run_config_evaluator_relations" ADD CONSTRAINT "drc_evaluator_rel_evaluator_fk" FOREIGN KEY ("tenant_id","project_id","evaluator_id") REFERENCES "public"."evaluator"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;
CREATE TABLE "webhook_destination_evaluators" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"webhook_destination_id" varchar(256) NOT NULL,
	"evaluator_id" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "webhook_destination_evaluators_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
ALTER TABLE "webhook_destination_evaluators" ADD CONSTRAINT "webhook_destination_evaluators_destination_fk" FOREIGN KEY ("tenant_id","project_id","webhook_destination_id") REFERENCES "public"."webhook_destinations"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webhook_destination_evaluators" ADD CONSTRAINT "webhook_destination_evaluators_evaluator_fk" FOREIGN KEY ("tenant_id","project_id","evaluator_id") REFERENCES "public"."evaluator"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;
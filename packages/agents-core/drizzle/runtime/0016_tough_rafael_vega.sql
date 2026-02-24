CREATE TABLE "dataset_run_invocations" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"dataset_run_id" varchar(256) NOT NULL,
	"dataset_item_id" varchar(256) NOT NULL,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"attempt_number" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "dataset_run_invocations_tenant_id_id_pk" PRIMARY KEY("tenant_id","id")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "dataset_run_invocations_unique_idx" ON "dataset_run_invocations" USING btree ("dataset_run_id","dataset_item_id","agent_id","attempt_number");
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
	"message_template" text NOT NULL,
	"authentication" jsonb,
	"signing_secret" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "triggers_tenant_id_project_id_agent_id_id_pk" PRIMARY KEY("tenant_id","project_id","agent_id","id")
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
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_agent_fk" FOREIGN KEY ("tenant_id","project_id","agent_id") REFERENCES "public"."agent"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trigger_invocations" ADD CONSTRAINT "trigger_invocations_trigger_fk" FOREIGN KEY ("tenant_id","project_id","agent_id","trigger_id") REFERENCES "public"."triggers"("tenant_id","project_id","agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "triggers_agent_id_idx" ON "triggers" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "triggers_tenant_id_project_id_idx" ON "triggers" USING btree ("tenant_id","project_id");--> statement-breakpoint
CREATE INDEX "trigger_invocations_trigger_id_created_at_idx" ON "trigger_invocations" USING btree ("trigger_id","created_at" DESC);--> statement-breakpoint
CREATE INDEX "trigger_invocations_trigger_id_status_idx" ON "trigger_invocations" USING btree ("trigger_id","status");

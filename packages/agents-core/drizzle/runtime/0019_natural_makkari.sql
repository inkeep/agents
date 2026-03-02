CREATE TABLE "pending_interactions" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"conversation_id" varchar(256) NOT NULL,
	"task_id" varchar(256),
	"sub_agent_id" varchar(256) NOT NULL,
	"type" varchar(64) NOT NULL,
	"status" varchar(64) DEFAULT 'pending' NOT NULL,
	"interaction_data" jsonb NOT NULL,
	"checkpoint" jsonb NOT NULL,
	"response" jsonb,
	"expires_at" timestamp,
	"responded_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pending_interactions_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
ALTER TABLE "pending_interactions" ADD CONSTRAINT "pending_interactions_conversation_fk" FOREIGN KEY ("tenant_id","project_id","conversation_id") REFERENCES "public"."conversations"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pending_interactions_conversation_idx" ON "pending_interactions" USING btree ("tenant_id","project_id","conversation_id");--> statement-breakpoint
CREATE INDEX "pending_interactions_status_idx" ON "pending_interactions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "pending_interactions_type_idx" ON "pending_interactions" USING btree ("type");
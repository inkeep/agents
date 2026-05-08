CREATE TABLE "events" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"type" varchar(256) NOT NULL,
	"agent_id" varchar(256),
	"conversation_id" varchar(256),
	"message_id" varchar(256),
	"properties" jsonb,
	"user_properties" jsonb,
	"metadata" jsonb,
	"server_metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "events_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_conversation_fk" FOREIGN KEY ("tenant_id","project_id","conversation_id") REFERENCES "public"."conversations"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_message_fk" FOREIGN KEY ("tenant_id","project_id","message_id") REFERENCES "public"."messages"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "events_created_at_idx" ON "events" USING btree ("tenant_id","project_id","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "events_conversation_id_idx" ON "events" USING btree ("tenant_id","project_id","conversation_id","created_at" DESC NULLS LAST);
CREATE TABLE "message_feedback" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"conversation_id" varchar(256) NOT NULL,
	"message_id" varchar(256) NOT NULL,
	"type" varchar(50) NOT NULL,
	"reasons" jsonb,
	"user_id" varchar(256),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "message_feedback_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id"),
	CONSTRAINT "message_feedback_message_unique" UNIQUE("tenant_id","project_id","message_id")
);
--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "message_feedback_conversation_fk" FOREIGN KEY ("tenant_id","project_id","conversation_id") REFERENCES "public"."conversations"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_feedback" ADD CONSTRAINT "message_feedback_message_fk" FOREIGN KEY ("tenant_id","project_id","message_id") REFERENCES "public"."messages"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "message_feedback_conversation_idx" ON "message_feedback" USING btree ("tenant_id","project_id","conversation_id");--> statement-breakpoint
CREATE INDEX "message_feedback_message_idx" ON "message_feedback" USING btree ("tenant_id","project_id","message_id");
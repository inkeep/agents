CREATE TABLE "trigger_users" (
	"tenant_id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"trigger_id" varchar(256) NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trigger_users_pk" PRIMARY KEY("tenant_id","project_id","agent_id","trigger_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "triggers" ADD COLUMN "dispatch_delay_ms" integer;--> statement-breakpoint
ALTER TABLE "trigger_users" ADD CONSTRAINT "trigger_users_trigger_fk" FOREIGN KEY ("tenant_id","project_id","agent_id","trigger_id") REFERENCES "public"."triggers"("tenant_id","project_id","agent_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "trigger_users_user_idx" ON "trigger_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "trigger_users_trigger_idx" ON "trigger_users" USING btree ("tenant_id","project_id","agent_id","trigger_id");
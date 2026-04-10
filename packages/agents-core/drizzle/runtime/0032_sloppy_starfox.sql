CREATE TABLE "scheduled_trigger_users" (
	"tenant_id" varchar(256) NOT NULL,
	"scheduled_trigger_id" varchar(256) NOT NULL,
	"user_id" varchar(256) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sched_trigger_users_pk" PRIMARY KEY("tenant_id","scheduled_trigger_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "scheduled_trigger_invocations" ADD COLUMN "run_as_user_id" varchar(256);--> statement-breakpoint
ALTER TABLE "scheduled_triggers" ADD COLUMN "dispatch_delay_ms" integer;--> statement-breakpoint
ALTER TABLE "scheduled_trigger_users" ADD CONSTRAINT "scheduled_trigger_users_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheduled_trigger_users" ADD CONSTRAINT "sched_trigger_users_trigger_fk" FOREIGN KEY ("tenant_id","scheduled_trigger_id") REFERENCES "public"."scheduled_triggers"("tenant_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sched_trigger_users_user_idx" ON "scheduled_trigger_users" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sched_trigger_users_trigger_idx" ON "scheduled_trigger_users" USING btree ("tenant_id","scheduled_trigger_id");--> statement-breakpoint
CREATE INDEX "sched_invocations_trigger_scheduled_for_idx" ON "scheduled_trigger_invocations" USING btree ("tenant_id","project_id","agent_id","scheduled_trigger_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "sched_invocations_trigger_user_scheduled_for_idx" ON "scheduled_trigger_invocations" USING btree ("tenant_id","project_id","agent_id","scheduled_trigger_id","run_as_user_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "sched_invocations_status_scheduled_for_idx" ON "scheduled_trigger_invocations" USING btree ("tenant_id","project_id","agent_id","status","scheduled_for");
ALTER TABLE "trigger_invocations" ADD COLUMN "run_as_user_id" varchar(256);--> statement-breakpoint
ALTER TABLE "trigger_invocations" ADD COLUMN "batch_id" varchar(256);--> statement-breakpoint
CREATE INDEX "trigger_invocations_batch_idx" ON "trigger_invocations" USING btree ("trigger_id","batch_id");
CREATE TABLE "usage_events" (
	"request_id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"agent_id" varchar(256) NOT NULL,
	"sub_agent_id" varchar(256),
	"conversation_id" varchar(256),
	"message_id" varchar(256),
	"generation_type" varchar(64) NOT NULL,
	"trace_id" varchar(256),
	"span_id" varchar(256),
	"requested_model" varchar(512) NOT NULL,
	"resolved_model" varchar(512),
	"provider" varchar(256) NOT NULL,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"total_tokens" integer GENERATED ALWAYS AS (input_tokens + output_tokens) STORED,
	"reasoning_tokens" integer,
	"cached_read_tokens" integer,
	"cached_write_tokens" integer,
	"step_count" integer DEFAULT 1 NOT NULL,
	"estimated_cost_usd" numeric(20, 8),
	"streamed" boolean DEFAULT false NOT NULL,
	"finish_reason" varchar(64),
	"generation_duration_ms" integer,
	"byok" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'succeeded' NOT NULL,
	"error_code" varchar(256),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usage_events_status_check" CHECK ("usage_events"."status" IN ('succeeded', 'failed', 'timeout'))
);
--> statement-breakpoint
CREATE INDEX "usage_events_project_time_idx" ON "usage_events" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_events_tenant_time_idx" ON "usage_events" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_events_agent_time_idx" ON "usage_events" USING btree ("agent_id","sub_agent_id","created_at");--> statement-breakpoint
CREATE INDEX "usage_events_model_idx" ON "usage_events" USING btree ("provider","resolved_model","created_at");--> statement-breakpoint
CREATE INDEX "usage_events_conversation_idx" ON "usage_events" USING btree ("conversation_id");--> statement-breakpoint
CREATE INDEX "usage_events_message_idx" ON "usage_events" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "usage_events_trace_idx" ON "usage_events" USING btree ("trace_id");--> statement-breakpoint
CREATE INDEX "usage_events_type_idx" ON "usage_events" USING btree ("generation_type","created_at");
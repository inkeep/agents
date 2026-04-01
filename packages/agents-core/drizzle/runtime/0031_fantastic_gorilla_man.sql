CREATE TABLE "stream_chunks" (
	"tenant_id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"conversation_id" varchar(256) NOT NULL,
	"idx" integer NOT NULL,
	"data" text NOT NULL,
	"is_final" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stream_chunks_tenant_id_project_id_conversation_id_idx_pk" PRIMARY KEY("tenant_id","project_id","conversation_id","idx")
);
--> statement-breakpoint
CREATE INDEX "stream_chunks_cleanup_idx" ON "stream_chunks" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "stream_chunks_conversation_idx" ON "stream_chunks" USING btree ("tenant_id","project_id","conversation_id","idx");
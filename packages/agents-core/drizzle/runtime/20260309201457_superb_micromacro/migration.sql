CREATE TABLE "apps" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(256),
	"project_id" varchar(256),
	"name" varchar(256) NOT NULL,
	"description" text,
	"type" varchar(64) NOT NULL,
	"default_project_id" varchar(256),
	"default_agent_id" varchar(256),
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "apps_tenant_project_idx" ON "apps" USING btree ("tenant_id","project_id");
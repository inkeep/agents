CREATE TABLE "anonymous_users" (
	"id" varchar(256) NOT NULL,
	"tenant_id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "anonymous_users_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id")
);
--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "anonymous_user_id" varchar(256);--> statement-breakpoint
CREATE INDEX "anonymous_users_tenant_project_idx" ON "anonymous_users" USING btree ("tenant_id","project_id");
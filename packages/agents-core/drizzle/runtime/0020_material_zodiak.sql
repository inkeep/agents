CREATE TABLE "apps" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"name" varchar(256) NOT NULL,
	"description" text,
	"type" varchar(64) NOT NULL,
	"agent_access_mode" varchar(20) DEFAULT 'selected' NOT NULL,
	"allowed_agent_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"default_agent_id" varchar(256),
	"public_id" varchar(256) NOT NULL,
	"key_hash" varchar(256),
	"key_prefix" varchar(256),
	"enabled" boolean DEFAULT true NOT NULL,
	"config" jsonb NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "apps_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id"),
	CONSTRAINT "apps_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "user_profile" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"timezone" text,
	"attributes" jsonb DEFAULT '{}'::jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "user_profile_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
ALTER TABLE "apps" ADD CONSTRAINT "apps_organization_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "apps_public_id_idx" ON "apps" USING btree ("public_id");--> statement-breakpoint
CREATE INDEX "apps_tenant_project_idx" ON "apps" USING btree ("tenant_id","project_id");
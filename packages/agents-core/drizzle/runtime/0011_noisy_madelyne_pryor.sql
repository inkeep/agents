CREATE TABLE "work_app_slack_account_link_codes" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(256) NOT NULL,
	"client_id" varchar(256) DEFAULT 'work-apps-slack' NOT NULL,
	"link_code_hash" varchar(64) NOT NULL,
	"slack_user_id" varchar(256) NOT NULL,
	"slack_team_id" varchar(256) NOT NULL,
	"slack_enterprise_id" varchar(256),
	"slack_username" varchar(256),
	"slack_email" varchar(256),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"used_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "work_app_slack_account_link_codes_link_code_hash_unique" UNIQUE("link_code_hash")
);
--> statement-breakpoint
CREATE TABLE "work_app_slack_user_mappings" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(256) NOT NULL,
	"client_id" varchar(256) DEFAULT 'work-apps-slack' NOT NULL,
	"slack_user_id" varchar(256) NOT NULL,
	"slack_team_id" varchar(256) NOT NULL,
	"slack_enterprise_id" varchar(256),
	"inkeep_user_id" text NOT NULL,
	"slack_username" varchar(256),
	"slack_email" varchar(256),
	"linked_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "work_app_slack_user_mappings_unique" UNIQUE("tenant_id","client_id","slack_team_id","slack_user_id")
);
--> statement-breakpoint
CREATE TABLE "work_app_slack_workspaces" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(256) NOT NULL,
	"slack_team_id" varchar(256) NOT NULL,
	"slack_enterprise_id" varchar(256),
	"slack_app_id" varchar(256),
	"slack_team_name" varchar(512),
	"nango_provider_config_key" varchar(256) DEFAULT 'work-apps-slack' NOT NULL,
	"nango_connection_id" varchar(256) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"installed_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "work_app_slack_workspaces_tenant_team_unique" UNIQUE("tenant_id","slack_team_id")
);
--> statement-breakpoint
ALTER TABLE "work_app_slack_account_link_codes" ADD CONSTRAINT "work_app_slack_account_link_codes_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_app_slack_user_mappings" ADD CONSTRAINT "work_app_slack_user_mappings_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_app_slack_user_mappings" ADD CONSTRAINT "work_app_slack_user_mappings_inkeep_user_id_user_id_fk" FOREIGN KEY ("inkeep_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_app_slack_workspaces" ADD CONSTRAINT "work_app_slack_workspaces_tenant_id_organization_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_app_slack_workspaces" ADD CONSTRAINT "work_app_slack_workspaces_installed_by_user_id_user_id_fk" FOREIGN KEY ("installed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "work_app_slack_account_link_codes_tenant_idx" ON "work_app_slack_account_link_codes" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "work_app_slack_account_link_codes_hash_idx" ON "work_app_slack_account_link_codes" USING btree ("link_code_hash");--> statement-breakpoint
CREATE INDEX "work_app_slack_account_link_codes_status_idx" ON "work_app_slack_account_link_codes" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "work_app_slack_user_mappings_tenant_idx" ON "work_app_slack_user_mappings" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "work_app_slack_user_mappings_user_idx" ON "work_app_slack_user_mappings" USING btree ("inkeep_user_id");--> statement-breakpoint
CREATE INDEX "work_app_slack_user_mappings_team_idx" ON "work_app_slack_user_mappings" USING btree ("slack_team_id");--> statement-breakpoint
CREATE INDEX "work_app_slack_user_mappings_slack_user_idx" ON "work_app_slack_user_mappings" USING btree ("slack_user_id");--> statement-breakpoint
CREATE INDEX "work_app_slack_workspaces_tenant_idx" ON "work_app_slack_workspaces" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "work_app_slack_workspaces_team_idx" ON "work_app_slack_workspaces" USING btree ("slack_team_id");--> statement-breakpoint
CREATE INDEX "work_app_slack_workspaces_nango_idx" ON "work_app_slack_workspaces" USING btree ("nango_connection_id");
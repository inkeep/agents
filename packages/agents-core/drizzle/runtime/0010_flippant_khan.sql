CREATE TABLE "workapps_github_app_installations" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(256) NOT NULL,
	"installation_id" text NOT NULL,
	"account_login" varchar(256) NOT NULL,
	"account_id" text NOT NULL,
	"account_type" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workapps_github_app_installations_installation_id_unique" UNIQUE("installation_id")
);
--> statement-breakpoint
CREATE TABLE "workapps_github_app_repositories" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"installation_db_id" varchar(256) NOT NULL,
	"repository_id" text NOT NULL,
	"repository_name" varchar(256) NOT NULL,
	"repository_full_name" varchar(512) NOT NULL,
	"private" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workapps_github_app_repositories_repo_installation_unique" UNIQUE("installation_db_id","repository_id")
);
--> statement-breakpoint
CREATE TABLE "workapps_github_mcp_tool_repository_access" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"tool_id" varchar(256) NOT NULL,
	"tenant_id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"repository_db_id" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workapps_github_mcp_tool_repository_access_unique" UNIQUE("tool_id","repository_db_id")
);
--> statement-breakpoint
CREATE TABLE "workapps_github_project_repository_access" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"repository_db_id" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "workapps_github_project_repository_access_unique" UNIQUE("tenant_id","project_id","repository_db_id")
);
--> statement-breakpoint
ALTER TABLE "workapps_github_app_installations" ADD CONSTRAINT "workapps_github_app_installations_organization_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workapps_github_app_repositories" ADD CONSTRAINT "workapps_github_app_repositories_installation_fk" FOREIGN KEY ("installation_db_id") REFERENCES "public"."workapps_github_app_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workapps_github_mcp_tool_repository_access" ADD CONSTRAINT "workapps_github_mcp_tool_repository_access_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workapps_github_mcp_tool_repository_access" ADD CONSTRAINT "workapps_github_mcp_tool_repository_access_repo_fk" FOREIGN KEY ("repository_db_id") REFERENCES "public"."workapps_github_app_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workapps_github_project_repository_access" ADD CONSTRAINT "workapps_github_project_repository_access_tenant_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workapps_github_project_repository_access" ADD CONSTRAINT "workapps_github_project_repository_access_repo_fk" FOREIGN KEY ("repository_db_id") REFERENCES "public"."workapps_github_app_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workapps_github_app_installations_tenant_idx" ON "workapps_github_app_installations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "workapps_github_app_installations_installation_id_idx" ON "workapps_github_app_installations" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "workapps_github_app_repositories_installation_idx" ON "workapps_github_app_repositories" USING btree ("installation_db_id");--> statement-breakpoint
CREATE INDEX "workapps_github_app_repositories_full_name_idx" ON "workapps_github_app_repositories" USING btree ("repository_full_name");--> statement-breakpoint
CREATE INDEX "workapps_github_mcp_tool_repository_access_tool_idx" ON "workapps_github_mcp_tool_repository_access" USING btree ("tool_id");--> statement-breakpoint
CREATE INDEX "workapps_github_mcp_tool_repository_access_tenant_idx" ON "workapps_github_mcp_tool_repository_access" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "workapps_github_mcp_tool_repository_access_project_idx" ON "workapps_github_mcp_tool_repository_access" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "workapps_github_project_repository_access_tenant_idx" ON "workapps_github_project_repository_access" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "workapps_github_project_repository_access_project_idx" ON "workapps_github_project_repository_access" USING btree ("project_id");
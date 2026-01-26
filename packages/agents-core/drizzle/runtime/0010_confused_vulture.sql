CREATE TABLE "github_app_installations" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"tenant_id" varchar(256) NOT NULL,
	"installation_id" text NOT NULL,
	"account_login" varchar(256) NOT NULL,
	"account_id" text NOT NULL,
	"account_type" varchar(20) NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "github_app_installations_installation_id_unique" UNIQUE("installation_id")
);
--> statement-breakpoint
CREATE TABLE "github_app_repositories" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"installation_id" varchar(256) NOT NULL,
	"repository_id" text NOT NULL,
	"repository_name" varchar(256) NOT NULL,
	"repository_full_name" varchar(512) NOT NULL,
	"private" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "github_app_repositories_repo_installation_unique" UNIQUE("installation_id","repository_id")
);
--> statement-breakpoint
CREATE TABLE "github_project_repository_access" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"github_repository_id" varchar(256) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "github_project_repository_access_unique" UNIQUE("project_id","github_repository_id")
);
--> statement-breakpoint
ALTER TABLE "github_app_installations" ADD CONSTRAINT "github_app_installations_organization_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_app_repositories" ADD CONSTRAINT "github_app_repositories_installation_fk" FOREIGN KEY ("installation_id") REFERENCES "public"."github_app_installations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "github_project_repository_access" ADD CONSTRAINT "github_project_repository_access_repo_fk" FOREIGN KEY ("github_repository_id") REFERENCES "public"."github_app_repositories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "github_app_installations_tenant_idx" ON "github_app_installations" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "github_app_installations_installation_id_idx" ON "github_app_installations" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "github_app_repositories_installation_idx" ON "github_app_repositories" USING btree ("installation_id");--> statement-breakpoint
CREATE INDEX "github_app_repositories_full_name_idx" ON "github_app_repositories" USING btree ("repository_full_name");--> statement-breakpoint
CREATE INDEX "github_project_repository_access_project_idx" ON "github_project_repository_access" USING btree ("project_id");
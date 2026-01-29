CREATE TABLE "slack_link_codes" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"code" varchar(20) NOT NULL,
	"slack_user_id" varchar(256) NOT NULL,
	"slack_team_id" varchar(256) NOT NULL,
	"slack_enterprise_id" varchar(256),
	"slack_username" varchar(256),
	"slack_email" varchar(256),
	"nango_connection_id" varchar(256),
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"used_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "slack_link_codes_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "slack_user_links" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"slack_user_id" varchar(256) NOT NULL,
	"slack_team_id" varchar(256) NOT NULL,
	"slack_enterprise_id" varchar(256),
	"user_id" text NOT NULL,
	"nango_connection_id" varchar(256),
	"slack_username" varchar(256),
	"slack_email" varchar(256),
	"linked_at" timestamp DEFAULT now() NOT NULL,
	"last_used_at" timestamp,
	CONSTRAINT "slack_user_links_unique" UNIQUE("slack_user_id","slack_team_id")
);
--> statement-breakpoint
ALTER TABLE "slack_user_links" ADD CONSTRAINT "slack_user_links_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "slack_link_codes_code_idx" ON "slack_link_codes" USING btree ("code");--> statement-breakpoint
CREATE INDEX "slack_link_codes_status_idx" ON "slack_link_codes" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "slack_user_links_user_idx" ON "slack_user_links" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "slack_user_links_team_idx" ON "slack_user_links" USING btree ("slack_team_id");--> statement-breakpoint
CREATE INDEX "slack_user_links_slack_user_idx" ON "slack_user_links" USING btree ("slack_user_id");
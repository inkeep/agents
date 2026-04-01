ALTER TABLE "external_agents" DROP CONSTRAINT "external_agents_credential_reference_fk";--> statement-breakpoint
ALTER TABLE "credential_references" ADD COLUMN "tool_id" varchar(256);--> statement-breakpoint
ALTER TABLE "credential_references" ADD COLUMN "user_id" varchar(256);--> statement-breakpoint
ALTER TABLE "credential_references" ADD COLUMN "created_by" varchar(256);--> statement-breakpoint
ALTER TABLE "tools" ADD COLUMN "credential_scope" varchar(50) DEFAULT 'project' NOT NULL;--> statement-breakpoint
ALTER TABLE "credential_references" ADD CONSTRAINT "credential_references_id_unique" UNIQUE("id");--> statement-breakpoint
ALTER TABLE "credential_references" ADD CONSTRAINT "credential_references_tool_user_unique" UNIQUE("tool_id","user_id");--> statement-breakpoint
ALTER TABLE "external_agents" ADD CONSTRAINT "external_agents_credential_reference_fk" FOREIGN KEY ("credential_reference_id") REFERENCES "public"."credential_references"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tools" ADD CONSTRAINT "tools_credential_reference_fk" FOREIGN KEY ("credential_reference_id") REFERENCES "public"."credential_references"("id") ON DELETE set null ON UPDATE no action;

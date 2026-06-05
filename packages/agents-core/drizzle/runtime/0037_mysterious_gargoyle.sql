CREATE TABLE "invitation_project_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"invitation_id" text NOT NULL,
	"project_id" text NOT NULL,
	"project_role" text DEFAULT 'project_member' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "invitation_project_assignment" ADD CONSTRAINT "invitation_project_assignment_invitation_fk" FOREIGN KEY ("invitation_id") REFERENCES "public"."invitation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "invitation_project_assignment_invitation_idx" ON "invitation_project_assignment" USING btree ("invitation_id");
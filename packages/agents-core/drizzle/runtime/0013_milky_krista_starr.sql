ALTER TABLE "invitation" ADD COLUMN "auth_method" text;--> statement-breakpoint
CREATE UNIQUE INDEX "organization_slug_uidx" ON "organization" USING btree ("slug");
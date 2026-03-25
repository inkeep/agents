CREATE TABLE "org_entitlement" (
	"id" varchar(256) PRIMARY KEY NOT NULL,
	"organization_id" varchar(256) NOT NULL,
	"resource_type" text NOT NULL,
	"max_value" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "org_entitlement_org_resource_unique" UNIQUE("organization_id","resource_type"),
	CONSTRAINT "org_entitlement_resource_type_format" CHECK (resource_type ~ '^[a-z]+:[a-z][a-z0-9_]*$')
);
--> statement-breakpoint
ALTER TABLE "org_entitlement" ADD CONSTRAINT "org_entitlement_organization_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_entitlement_org_idx" ON "org_entitlement" USING btree ("organization_id");
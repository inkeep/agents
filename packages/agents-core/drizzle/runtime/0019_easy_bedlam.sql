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
ALTER TABLE "user_profile" ADD CONSTRAINT "user_profile_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
INSERT INTO "user_profile" ("id", "user_id", "timezone", "attributes", "created_at", "updated_at")
SELECT
  substr(replace(gen_random_uuid()::text, '-', ''), 1, 21),
  u."id",
  NULL,
  '{}'::jsonb,
  now(),
  now()
FROM "user" u
WHERE NOT EXISTS (
  SELECT 1 FROM "user_profile" up WHERE up."user_id" = u."id"
);
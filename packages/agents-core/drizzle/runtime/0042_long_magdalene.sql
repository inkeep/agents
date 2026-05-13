ALTER TABLE "oauth_access_token" ALTER COLUMN "token" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_consent" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_consent" ALTER COLUMN "updated_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "expires_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "sso_provider" ALTER COLUMN "user_id" SET NOT NULL;
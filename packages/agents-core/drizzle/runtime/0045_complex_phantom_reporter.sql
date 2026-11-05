DELETE FROM "device_code" WHERE "expires_at" < now();--> statement-breakpoint
DO $$
DECLARE
	r record;
	payload text;
	entra_oid text;
	total integer;
	keyed integer := 0;
BEGIN
	SELECT count(*) INTO total FROM "account" WHERE "provider_id" = 'microsoft';
	FOR r IN SELECT "id", "id_token" FROM "account" WHERE "provider_id" = 'microsoft' AND "id_token" IS NOT NULL LOOP
		entra_oid := NULL;
		BEGIN
			payload := translate(split_part(r."id_token", '.', 2), '-_', '+/');
			payload := rpad(payload, ((length(payload) + 3) / 4) * 4, '=');
			entra_oid := convert_from(decode(payload, 'base64'), 'UTF8')::jsonb ->> 'oid';
		EXCEPTION WHEN data_exception THEN
			entra_oid := NULL;
		END;
		IF entra_oid IS NOT NULL AND length(trim(entra_oid)) > 0 THEN
			UPDATE "account" SET "account_id" = entra_oid WHERE "id" = r."id";
			keyed := keyed + 1;
		END IF;
	END LOOP;
	RAISE NOTICE 'Microsoft accounts keyed by the Entra oid claim: % of %', keyed, total;
	IF keyed < total THEN
		RAISE WARNING 'Microsoft accounts left keyed by sub, with no decodable id_token carrying an oid claim: %. Those users get a new account row or an "account not linked" error on their next Microsoft sign-in.', total - keyed;
	END IF;
END $$;--> statement-breakpoint
DELETE FROM "account"
WHERE "provider_id" NOT IN ('credential', 'google', 'microsoft')
	AND NOT EXISTS (SELECT 1 FROM "sso_provider" s WHERE s."provider_id" = "account"."provider_id");--> statement-breakpoint
CREATE TABLE "oauth_client_assertion" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "oauth_client_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"client_id" text NOT NULL,
	"resource_id" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "oauth_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"name" text NOT NULL,
	"access_token_ttl" integer,
	"refresh_token_ttl" integer,
	"signing_algorithm" text,
	"signing_key_id" text,
	"allowed_scopes" text[],
	"custom_claims" jsonb,
	"dpop_bound_access_tokens_required" boolean DEFAULT false,
	"disabled" boolean DEFAULT false,
	"created_at" timestamp,
	"updated_at" timestamp,
	"policy_version" integer DEFAULT 1,
	"metadata" jsonb,
	CONSTRAINT "oauth_resource_identifier_unique" UNIQUE("identifier")
);
--> statement-breakpoint
ALTER TABLE "jwks" ADD COLUMN "alg" text;--> statement-breakpoint
ALTER TABLE "jwks" ADD COLUMN "crv" text;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD COLUMN "authorization_code_id" text;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD COLUMN "resources" text[];--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD COLUMN "requested_user_info_claims" text[];--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD COLUMN "revoked" timestamp;--> statement-breakpoint
ALTER TABLE "oauth_access_token" ADD COLUMN "confirmation" jsonb;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD COLUMN "client_discovery_id" text;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD COLUMN "client_credentials_scopes" text[];--> statement-breakpoint
ALTER TABLE "oauth_client" ADD COLUMN "backchannel_logout_uri" text;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD COLUMN "backchannel_logout_session_required" boolean;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD COLUMN "application_type" text;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD COLUMN "jwks" text;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD COLUMN "jwks_uri" text;--> statement-breakpoint
ALTER TABLE "oauth_client" ADD COLUMN "dpop_bound_access_tokens" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD COLUMN "resources" text[];--> statement-breakpoint
ALTER TABLE "oauth_consent" ADD COLUMN "requested_user_info_claims" text[];--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD COLUMN "authorization_code_id" text;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD COLUMN "resources" text[];--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD COLUMN "requested_user_info_claims" text[];--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD COLUMN "rotated_at" timestamp;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD COLUMN "rotation_replay_response" text;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD COLUMN "rotation_replay_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD COLUMN "confirmation" jsonb;--> statement-breakpoint
ALTER TABLE "oauth_client_resource" ADD CONSTRAINT "oauth_client_resource_client_id_oauth_client_client_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_client"("client_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "oauth_client_resource" ADD CONSTRAINT "oauth_client_resource_resource_id_oauth_resource_identifier_fk" FOREIGN KEY ("resource_id") REFERENCES "public"."oauth_resource"("identifier") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "oauth_client_resource_client_resource_uidx" ON "oauth_client_resource" USING btree ("client_id","resource_id");--> statement-breakpoint
CREATE INDEX "oauth_client_resource_resourceId_idx" ON "oauth_client_resource" USING btree ("resource_id");--> statement-breakpoint
ALTER TABLE "device_code" ADD CONSTRAINT "device_code_device_code_unique" UNIQUE("device_code");--> statement-breakpoint
ALTER TABLE "device_code" ADD CONSTRAINT "device_code_user_code_unique" UNIQUE("user_code");--> statement-breakpoint
ALTER TABLE "oauth_refresh_token" ADD CONSTRAINT "oauth_refresh_token_token_unique" UNIQUE("token");
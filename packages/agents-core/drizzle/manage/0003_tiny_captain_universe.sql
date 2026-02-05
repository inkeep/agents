ALTER TABLE "triggers" ADD COLUMN "signing_secret_credential_reference_id" varchar(256) DEFAULT null;--> statement-breakpoint
ALTER TABLE "triggers" ADD COLUMN "signature_verification" jsonb DEFAULT null;--> statement-breakpoint
ALTER TABLE "triggers" DROP COLUMN "signing_secret";--> statement-breakpoint
ALTER TABLE "triggers" ALTER COLUMN "input_schema" SET DEFAULT null;--> statement-breakpoint
ALTER TABLE "triggers" ALTER COLUMN "output_transform" SET DEFAULT null;--> statement-breakpoint
ALTER TABLE "triggers" ALTER COLUMN "message_template" SET DEFAULT null;--> statement-breakpoint
ALTER TABLE "triggers" ALTER COLUMN "authentication" SET DEFAULT null;--> statement-breakpoint
ALTER TABLE "triggers" ADD CONSTRAINT "triggers_credential_reference_fk" FOREIGN KEY ("signing_secret_credential_reference_id") REFERENCES "public"."credential_references"("id") ON DELETE set null ON UPDATE no action;
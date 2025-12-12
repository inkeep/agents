CREATE TABLE "device_code" (
	"id" text PRIMARY KEY NOT NULL,
	"device_code" text NOT NULL,
	"user_code" text NOT NULL,
	"user_id" text,
	"expires_at" timestamp NOT NULL,
	"status" text NOT NULL,
	"last_polled_at" timestamp,
	"polling_interval" integer,
	"client_id" text,
	"scope" text
);
--> statement-breakpoint
ALTER TABLE "artifact_components" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "data_components" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "external_agents" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_agents" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_agents" ALTER COLUMN "prompt" DROP NOT NULL;
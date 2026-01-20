ALTER TABLE "artifact_components" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "data_components" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "external_agents" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_agents" ALTER COLUMN "description" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "sub_agents" ALTER COLUMN "prompt" DROP NOT NULL;
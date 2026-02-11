UPDATE "data_components" SET "props" = '{"type": "object", "properties": {}}' WHERE "props" IS NULL;
--> statement-breakpoint
ALTER TABLE "data_components" ALTER COLUMN "props" SET NOT NULL;
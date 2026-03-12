CREATE TABLE "skill_files" (
	"tenant_id" varchar(256) NOT NULL,
	"id" varchar(256) NOT NULL,
	"project_id" varchar(256) NOT NULL,
	"skill_id" varchar(64) NOT NULL,
	"file_path" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "skill_files_tenant_id_project_id_id_pk" PRIMARY KEY("tenant_id","project_id","id"),
	CONSTRAINT "skill_files_skill_path_unique" UNIQUE("tenant_id","project_id","skill_id","file_path")
);
--> statement-breakpoint
INSERT INTO "skill_files" (
	"tenant_id",
	"id",
	"project_id",
	"skill_id",
	"file_path",
	"content",
	"created_at",
	"updated_at"
)
SELECT
	"skills"."tenant_id",
	"skills"."id" || '__skill_md',
	"skills"."project_id",
	"skills"."id",
	'SKILL.md',
	'---' || E'\n' ||
	'name: ' || "skills"."name" || E'\n' ||
	'description: "' ||
		replace(
			replace(
				replace("skills"."description", E'\\', E'\\\\'),
				'"',
				E'\\"'
			),
			E'\n',
			E'\\n'
		) ||
	'"' ||
	E'\n---\n' ||
	"skills"."content",
	"skills"."created_at",
	"skills"."updated_at"
FROM "skills";
--> statement-breakpoint
ALTER TABLE "skill_files" ADD CONSTRAINT "skill_files_skill_fk" FOREIGN KEY ("tenant_id","project_id","skill_id") REFERENCES "public"."skills"("tenant_id","project_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "skill_files_skill_idx" ON "skill_files" USING btree ("skill_id");

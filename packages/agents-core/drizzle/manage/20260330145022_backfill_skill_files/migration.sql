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
	'legacy-' || md5(
		"skills"."tenant_id" || ':' || "skills"."project_id" || ':' || "skills"."id" || ':SKILL.md'
	),
	"skills"."project_id",
	"skills"."id",
	'SKILL.md',
	concat(
		E'---\n',
		'name: ',
		"skills"."name",
		E'\n',
		'description: ',
		CASE
			WHEN "skills"."description" IS NULL THEN 'null'
			ELSE concat(
				'"',
				replace(
					replace(
						replace(
							replace("skills"."description", E'\\', E'\\\\'),
							E'"',
							E'\\"'
						),
						E'\n',
						E'\\n'
					),
					E'\r',
					E'\\r'
				),
				'"'
			)
		END,
		CASE
			WHEN "skills"."metadata" IS NULL THEN ''
			ELSE E'\nmetadata: ' || "skills"."metadata"::text
		END,
		E'\n---\n\n',
		"skills"."content"
	),
	"skills"."created_at",
	"skills"."updated_at"
FROM "skills"
LEFT JOIN "skill_files"
	ON "skill_files"."tenant_id" = "skills"."tenant_id"
	AND "skill_files"."project_id" = "skills"."project_id"
	AND "skill_files"."skill_id" = "skills"."id"
	AND "skill_files"."file_path" = 'SKILL.md'
WHERE "skill_files"."id" IS NULL
ON CONFLICT ("tenant_id", "project_id", "skill_id", "file_path") DO NOTHING;

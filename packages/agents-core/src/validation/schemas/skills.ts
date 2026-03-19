import { z } from '@hono/zod-openapi';
import { parseSkillFromMarkdown, SKILL_ENTRY_FILE_PATH } from '../../utils/skill-files';
import { skillFiles, skills, subAgentSkills } from '../../db/manage/manage-schema';
import { ResourceIdSchema, StringRecordSchema, PaginationSchema } from './shared';

const SkillIndexSchema = z.int().min(0);

export const SkillFrontmatterSchema = z.looseObject({
  name: z
    .string()
    .trim()
    .nonempty()
    .max(64)
    .regex(
      /^[a-z0-9-]+$/,
      'May only contain lowercase alphanumeric characters and hyphens (a-z, 0-9, -)'
    )
    .refine(
      (v) => !(v.startsWith('-') || v.endsWith('-')),
      'Must not start or end with a hyphen (-)'
    )
    .refine((v) => !v.includes('--'), 'Must not contain consecutive hyphens (--)')
    .refine((v) => v !== 'new', 'Must not use a reserved name "new"'),
  description: z.string().trim().nonempty().max(1024),
  metadata: StringRecordSchema.nullish(),
});

export const SkillFilePathSchema = z
  .string()
  .trim()
  .nonempty()
  .max(1024)
  .refine((value) => !value.startsWith('/'), 'Must be a relative file path')
  .refine((value) => !value.includes('\\'), 'Must use forward slashes (/) in file paths')
  .refine(
    (value) =>
      value.split('/').every((segment) => segment !== '' && segment !== '.' && segment !== '..'),
    'Must not contain empty, ".", or ".." path segments'
  );

export const SkillSelectSchema = createSelectSchema(skills).extend({
  metadata: StringRecordSchema.nullable(),
});

export const SkillFileContentInputSchema = z.object({
  filePath: SkillFilePathSchema,
  content: z.string(),
});

function addDuplicateSkillFilePathIssues(
  files: Array<z.infer<typeof SkillFileContentInputSchema>>,
  ctx: z.RefinementCtx
) {
  const filePaths = new Set<string>();

  for (const [index, file] of files.entries()) {
    if (filePaths.has(file.filePath)) {
      ctx.addIssue({
        code: 'custom',
        path: [index, 'filePath'],
        message: `Duplicate skill file path: ${file.filePath}`,
      });
    }
    filePaths.add(file.filePath);
  }
}

const SkillUpdateFilesInputSchema = z
  .array(SkillFileContentInputSchema)
  .superRefine(addDuplicateSkillFilePathIssues);

const SkillFilesInputSchema = z.array(SkillFileContentInputSchema).superRefine((files, ctx) => {
  addDuplicateSkillFilePathIssues(files, ctx);

  if (!files.some((file) => file.filePath === SKILL_ENTRY_FILE_PATH)) {
    ctx.addIssue({
      code: 'custom',
      message: `Skill files must include exactly one ${SKILL_ENTRY_FILE_PATH}`,
    });
  }
});

export const SkillFileSelectSchema = createSelectSchema(skillFiles);

export const SkillFileInsertSchema = createInsertSchema(skillFiles).extend({
  id: ResourceIdSchema,
  skillId: ResourceIdSchema,
  filePath: SkillFilePathSchema,
  content: z.string(),
});

export const SkillInsertSchema = createInsertSchema(skills)
  .extend({
    ...SkillFrontmatterSchema.shape,
    content: z.string().trim().nonempty(),
  })
  .omit({
    // We set id under the hood as skill.name
    id: true,
    createdAt: true,
    updatedAt: true,
    projectId: true,
    tenantId: true,
  });

export const SkillUpdateSchema = SkillInsertSchema.omit({
  // Name is persistent
  name: true,
  // Will be generated from SKILL.md
  content: true,
  description: true,
  metadata: true,
}).extend({
  files: SkillUpdateFilesInputSchema,
});

function transformSkill(markdown: string) {
  const { frontmatter, content } = parseSkillFromMarkdown(markdown);
  const {
    name,
    description,
    metadata = null,
  } = frontmatter as z.output<typeof SkillFrontmatterSchema>;

  return {
    name,
    description,
    metadata,
    content,
  };
}

export const SkillApiSelectSchema = createApiSchema(SkillSelectSchema).openapi('Skill');

export const SkillApiInsertSchema = z
  .object({
    files: SkillFilesInputSchema,
  })
  .transform((skill) => {
    const skillFile = skill.files.find((skill) => skill.filePath === SKILL_ENTRY_FILE_PATH);
    if (!skillFile) {
      throw new Error('should never happens');
    }
    return {
      ...skill,
      ...transformSkill(skillFile.content),
    };
  })
  // @ts-expect-error
  .pipe(SkillFrontmatterSchema)
  .openapi('SkillCreate');

export const SkillApiUpdateSchema = createApiUpdateSchema(SkillUpdateSchema)
  .transform((skill) => {
    const skillFile = skill.files?.find((skill) => skill.filePath === SKILL_ENTRY_FILE_PATH);
    if (!skillFile) {
      return skill;
    }
    return {
      ...skill,
      ...transformSkill(skillFile.content),
    };
  })
  .openapi('SkillUpdate');

export const SkillFileApiSelectSchema = createApiSchema(SkillFileSelectSchema).openapi('SkillFile');

export const SkillWithFilesApiSelectSchema = SkillApiSelectSchema.extend({
  files: z.array(SkillFileApiSelectSchema),
}).openapi('SkillWithFiles');

export const SubAgentSkillSelectSchema = createSelectSchema(subAgentSkills).extend({
  index: SkillIndexSchema,
});

export const SubAgentSkillInsertSchema = createInsertSchema(subAgentSkills).extend({
  id: ResourceIdSchema,
  subAgentId: ResourceIdSchema,
  skillId: ResourceIdSchema,
  index: SkillIndexSchema,
  alwaysLoaded: z.boolean().optional().default(false),
});

export const SubAgentSkillUpdateSchema = SubAgentSkillInsertSchema.partial();

export const SubAgentSkillApiSelectSchema =
  createAgentScopedApiSchema(SubAgentSkillSelectSchema).openapi('SubAgentSkill');

export const SubAgentSkillApiInsertSchema = SubAgentSkillInsertSchema.omit({
  tenantId: true,
  projectId: true,
  id: true,
  createdAt: true,
  updatedAt: true,
}).openapi('SubAgentSkillCreate');

export const SubAgentSkillApiUpdateSchema =
  createAgentScopedApiUpdateSchema(SubAgentSkillUpdateSchema).openapi('SubAgentSkillUpdate');

export const SubAgentSkillWithIndexSchema = SkillApiSelectSchema.extend({
  subAgentSkillId: ResourceIdSchema,
  subAgentId: ResourceIdSchema,
  index: SkillIndexSchema,
  alwaysLoaded: z.boolean(),
}).openapi('SubAgentSkillWithIndex');

export const SkillResponse = z.object({ data: SkillApiSelectSchema }).openapi('SkillResponse');
export const SkillWithFilesResponse = z
  .object({ data: SkillWithFilesApiSelectSchema })
  .openapi('SkillWithFilesResponse');
export const SkillListResponse = z
  .object({
    data: z.array(SkillApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('SkillListResponse');

export const SubAgentSkillResponse = z
  .object({ data: SubAgentSkillApiSelectSchema })
  .openapi('SubAgentSkillResponse');
export const SubAgentSkillWithIndexArrayResponse = z
  .object({ data: z.array(SubAgentSkillWithIndexSchema) })
  .openapi('SubAgentSkillWithIndexArrayResponse');

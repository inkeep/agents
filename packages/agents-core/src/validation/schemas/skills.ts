import { z } from '@hono/zod-openapi';
import { parseSkillFromMarkdown, SKILL_ENTRY_FILE_PATH } from '../../utils/skill-files';
import { skillFiles, skills, subAgentSkills } from '../../db/manage/manage-schema';
import {
  ResourceIdSchema,
  StringRecordSchema,
  PaginationSchema,
  createApiSchema,
  createApiUpdateSchema,
  createAgentScopedApiUpdateSchema,
  createAgentScopedApiSchema,
} from './shared';
import { createInsertSchema, createSelectSchema } from '../drizzle-schema-helpers';

const SkillIndexSchema = z.int().min(0);

const SkillFrontmatterSchema = z.looseObject({
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

const SkillFilePathSchema = z
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

const SkillSelectSchema = createSelectSchema(skills).extend({
  metadata: StringRecordSchema.nullable(),
});

const SkillFileContentInputSchema = z.object({
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

const SkillFileSelectSchema = createSelectSchema(skillFiles);

const SkillFileInsertSchema = createInsertSchema(skillFiles).extend({
  id: ResourceIdSchema,
  skillId: ResourceIdSchema,
  filePath: SkillFilePathSchema,
  content: z.string(),
});

const SkillInsertSchema = createInsertSchema(skills)
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

const SkillUpdateSchema = SkillInsertSchema.omit({
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

const SkillApiSelectSchema = createApiSchema(SkillSelectSchema).openapi('Skill');

const SkillApiInsertSchema = z
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

const SkillApiUpdateSchema = createApiUpdateSchema(SkillUpdateSchema)
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

const SkillFileApiSelectSchema = createApiSchema(SkillFileSelectSchema).openapi('SkillFile');

const SkillWithFilesApiSelectSchema = SkillApiSelectSchema.extend({
  files: z.array(SkillFileApiSelectSchema),
}).openapi('SkillWithFiles');

const SubAgentSkillSelectSchema = createSelectSchema(subAgentSkills).extend({
  index: SkillIndexSchema,
});

const SubAgentSkillInsertSchema = createInsertSchema(subAgentSkills).extend({
  id: ResourceIdSchema,
  subAgentId: ResourceIdSchema,
  skillId: ResourceIdSchema,
  index: SkillIndexSchema,
  alwaysLoaded: z.boolean().optional().default(false),
});

const SubAgentSkillUpdateSchema = SubAgentSkillInsertSchema.partial();

const SubAgentSkillApiSelectSchema =
  createAgentScopedApiSchema(SubAgentSkillSelectSchema).openapi('SubAgentSkill');

const SubAgentSkillApiInsertSchema = SubAgentSkillInsertSchema.omit({
  tenantId: true,
  projectId: true,
  id: true,
  createdAt: true,
  updatedAt: true,
}).openapi('SubAgentSkillCreate');

const SubAgentSkillApiUpdateSchema =
  createAgentScopedApiUpdateSchema(SubAgentSkillUpdateSchema).openapi('SubAgentSkillUpdate');

const SubAgentSkillWithIndexSchema = SkillApiSelectSchema.extend({
  subAgentSkillId: ResourceIdSchema,
  subAgentId: ResourceIdSchema,
  index: SkillIndexSchema,
  alwaysLoaded: z.boolean(),
}).openapi('SubAgentSkillWithIndex');

const SkillResponse = z.object({ data: SkillApiSelectSchema }).openapi('SkillResponse');

const SkillWithFilesResponse = z
  .object({ data: SkillWithFilesApiSelectSchema })
  .openapi('SkillWithFilesResponse');

const SkillListResponse = z
  .object({
    data: z.array(SkillApiSelectSchema),
    pagination: PaginationSchema,
  })
  .openapi('SkillListResponse');

const SubAgentSkillResponse = z
  .object({ data: SubAgentSkillApiSelectSchema })
  .openapi('SubAgentSkillResponse');

const SubAgentSkillWithIndexArrayResponse = z
  .object({ data: z.array(SubAgentSkillWithIndexSchema) })
  .openapi('SubAgentSkillWithIndexArrayResponse');

export {
  SkillApiInsertSchema,
  SkillIndexSchema,
  SubAgentSkillWithIndexSchema,
  SubAgentSkillUpdateSchema,
  SubAgentSkillSelectSchema,
  SubAgentSkillInsertSchema,
  SubAgentSkillApiUpdateSchema,
  SubAgentSkillApiSelectSchema,
  SubAgentSkillApiInsertSchema,
  SkillWithFilesApiSelectSchema,
  SkillUpdateSchema,
  SkillSelectSchema,
  SkillInsertSchema,
  SkillFileSelectSchema,
  SkillFileInsertSchema,
  SkillFileApiSelectSchema,
  SkillApiUpdateSchema,
  SkillApiSelectSchema,
  SubAgentSkillWithIndexArrayResponse,
  SubAgentSkillResponse,
  SkillWithFilesResponse,
  SkillListResponse,
  SkillFrontmatterSchema,
};

import { and, asc, count, desc, eq, inArray } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import { skillFiles, skills, subAgentSkills } from '../../db/manage/manage-schema';
import type {
  SkillApiInsert,
  SkillApiUpdate,
  SkillFileApiInsert,
  SkillFileSelect,
  SkillSelect,
  SubAgentSkillInsert,
  SubAgentSkillWithIndex,
} from '../../types/entities';
import type {
  AgentScopeConfig,
  PaginationConfig,
  ProjectScopeConfig,
  SubAgentScopeConfig,
} from '../../types/utility';
import { deriveRelationId } from '../../utils/conversations';
import { generateId } from '../../utils/conversations';
import { getLogger } from '../../utils/logger';
import { parseSkillFromMarkdown, SKILL_ENTRY_FILE_PATH } from '../../utils/skill-files';
import { SkillFrontmatterSchema } from '../../validation/schemas/skills';
import { agentScopedWhere, projectScopedWhere, subAgentScopedWhere } from './scope-helpers';

const logger = getLogger('skills-dal');

interface SkillRecordWithFiles extends SkillSelect {
  files: SkillFileSelect[];
}

async function replaceSkillFiles(
  db: AgentsManageDatabaseClient,
  params: {
    scopes: ProjectScopeConfig;
    skillId: string;
    files: SkillFileApiInsert[];
  }
) {
  const existingFiles = await db
    .select()
    .from(skillFiles)
    .where(
      and(
        eq(skillFiles.tenantId, params.scopes.tenantId),
        eq(skillFiles.projectId, params.scopes.projectId),
        eq(skillFiles.skillId, params.skillId)
      )
    );

  const nextFilePaths = new Set(params.files.map((file) => file.filePath));
  const existingByPath = new Map(existingFiles.map((file) => [file.filePath, file]));
  const fileIdsToDelete = existingFiles
    .filter((file) => !nextFilePaths.has(file.filePath))
    .map((file) => file.id);

  if (fileIdsToDelete.length) {
    await db
      .delete(skillFiles)
      .where(
        and(
          projectScopedWhere(skillFiles, params.scopes),
          eq(skillFiles.skillId, params.skillId),
          inArray(skillFiles.id, fileIdsToDelete)
        )
      );
  }

  const now = new Date().toISOString();
  const filesToInsert: SkillFileSelect[] = [];

  for (const file of params.files) {
    const existingFile = existingByPath.get(file.filePath);

    if (!existingFile) {
      filesToInsert.push({
        tenantId: params.scopes.tenantId,
        projectId: params.scopes.projectId,
        skillId: params.skillId,
        id: generateId(),
        filePath: file.filePath,
        content: file.content,
        createdAt: now,
        updatedAt: now,
      });
      continue;
    }

    await db
      .update(skillFiles)
      .set({
        content: file.content,
        updatedAt: now,
      })
      .where(
        and(
          projectScopedWhere(skillFiles, params.scopes),
          eq(skillFiles.skillId, params.skillId),
          eq(skillFiles.id, existingFile.id)
        )
      );
  }

  if (filesToInsert.length) {
    await db.insert(skillFiles).values(filesToInsert);
  }

  const filesBySkillId = await getSkillFilesBySkillIds(db)({
    scopes: params.scopes,
    skillIds: [params.skillId],
  });

  return filesBySkillId[params.skillId] ?? [];
}

export const getSkillFilesBySkillIds =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    skillIds: string[];
  }): Promise<Record<string, SkillFileSelect[]>> => {
    if (!params.skillIds.length) {
      return {};
    }

    const files = await db
      .select()
      .from(skillFiles)
      .where(
        and(
          eq(skillFiles.tenantId, params.scopes.tenantId),
          eq(skillFiles.projectId, params.scopes.projectId),
          inArray(skillFiles.skillId, params.skillIds)
        )
      )
      .orderBy(asc(skillFiles.filePath));

    return files.reduce<Record<string, SkillFileSelect[]>>((acc, file) => {
      acc[file.skillId] ??= [];
      acc[file.skillId].push(file);
      return acc;
    }, {});
  };

export const getSkillById =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; skillId: string }) => {
    const result = await db.query.skills.findFirst({
      where: and(projectScopedWhere(skills, params.scopes), eq(skills.id, params.skillId)),
    });
    return result ?? null;
  };

export const getSkillByIdWithFiles =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    skillId: string;
  }): Promise<SkillRecordWithFiles | null> => {
    const skill = await getSkillById(db)(params);
    if (!skill) {
      return null;
    }

    const files = await getSkillFilesBySkillIds(db)({
      scopes: params.scopes,
      skillIds: [params.skillId],
    });

    return {
      ...skill,
      files: files[params.skillId] ?? [],
    };
  };

export const getSkillFileById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    skillId: string;
    fileId: string;
  }): Promise<SkillFileSelect | null> => {
    const file = await db.query.skillFiles.findFirst({
      where: and(
        projectScopedWhere(skillFiles, params.scopes),
        eq(skillFiles.skillId, params.skillId),
        eq(skillFiles.id, params.fileId)
      ),
    });

    return file ?? null;
  };

export const createSkillFileById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    skillId: string;
    data: SkillFileApiInsert;
  }): Promise<SkillFileSelect | null> => {
    const skill = await getSkillByIdWithFiles(db)({
      scopes: params.scopes,
      skillId: params.skillId,
    });

    if (!skill) {
      return null;
    }

    if (params.data.filePath === SKILL_ENTRY_FILE_PATH) {
      throw new Error(`Use the skill update flow to manage ${SKILL_ENTRY_FILE_PATH}`);
    }

    if (skill.files.some((file) => file.filePath === params.data.filePath)) {
      throw new Error(`Skill file already exists at path "${params.data.filePath}"`);
    }

    const now = new Date().toISOString();
    const [createdFile] = await db
      .insert(skillFiles)
      .values({
        tenantId: params.scopes.tenantId,
        projectId: params.scopes.projectId,
        skillId: params.skillId,
        id: generateId(),
        filePath: params.data.filePath,
        content: params.data.content,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    return createdFile ?? null;
  };

function buildEntryFileUpdateData(params: {
  skillId: string;
  files: SkillFileApiInsert[];
  content: string;
}): SkillApiUpdate {
  const parsed = parseSkillFromMarkdown(params.content);
  const frontmatterResult = SkillFrontmatterSchema.safeParse(parsed.frontmatter);

  if (!frontmatterResult.success) {
    throw new Error(frontmatterResult.error.issues[0]?.message ?? 'Invalid SKILL.md frontmatter');
  }

  if (frontmatterResult.data.name !== params.skillId) {
    throw new Error('SKILL.md name must match the skill id');
  }

  return {
    description: frontmatterResult.data.description,
    metadata: frontmatterResult.data.metadata ?? null,
    content: parsed.content,
    files: params.files,
  };
}

export const updateSkillFileById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    skillId: string;
    fileId: string;
    content: string;
  }): Promise<SkillFileSelect | null> => {
    const skill = await getSkillByIdWithFiles(db)({
      scopes: params.scopes,
      skillId: params.skillId,
    });

    if (!skill) {
      return null;
    }

    const existingFile = skill.files.find((file) => file.id === params.fileId);

    if (!existingFile) {
      return null;
    }

    const files = skill.files.map((file) => ({
      filePath: file.filePath,
      content: file.id === params.fileId ? params.content : file.content,
    }));

    const data =
      existingFile.filePath === SKILL_ENTRY_FILE_PATH
        ? buildEntryFileUpdateData({
            skillId: params.skillId,
            files,
            content: params.content,
          })
        : { files };

    const updatedSkill = await updateSkill(db)({
      scopes: params.scopes,
      skillId: params.skillId,
      data,
    });

    if (!updatedSkill) {
      return null;
    }

    return await getSkillFileById(db)({
      scopes: params.scopes,
      skillId: params.skillId,
      fileId: params.fileId,
    });
  };

export const deleteSkillFileById =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: ProjectScopeConfig;
    skillId: string;
    fileId: string;
  }): Promise<boolean | null> => {
    const skill = await getSkillByIdWithFiles(db)({
      scopes: params.scopes,
      skillId: params.skillId,
    });

    if (!skill) {
      return null;
    }

    const existingFile = skill.files.find((file) => file.id === params.fileId);

    if (!existingFile) {
      return null;
    }

    if (existingFile.filePath === SKILL_ENTRY_FILE_PATH) {
      throw new Error('Use the skill delete flow to remove SKILL.md');
    }

    const updatedSkill = await updateSkill(db)({
      scopes: params.scopes,
      skillId: params.skillId,
      data: {
        files: skill.files
          .filter((file) => file.id !== params.fileId)
          .map((file) => ({
            filePath: file.filePath,
            content: file.content,
          })),
      },
    });

    return updatedSkill !== null;
  };

export const listSkills =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; pagination?: PaginationConfig }) => {
    const page = params.pagination?.page || 1;
    const limit = Math.min(params.pagination?.limit || 10, 100);
    const offset = (page - 1) * limit;

    const whereClause = projectScopedWhere(skills, params.scopes);

    const [data, totalResult] = await Promise.all([
      db
        .select()
        .from(skills)
        .where(whereClause)
        .limit(limit)
        .offset(offset)
        .orderBy(desc(skills.createdAt)),
      db.select({ count: count() }).from(skills).where(whereClause),
    ]);

    const total = totalResult[0]?.count || 0;
    const pages = Math.ceil(total / limit);

    return {
      data,
      pagination: { page, limit, total, pages },
    };
  };

export const listSkillsWithFiles =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; pagination?: PaginationConfig }) => {
    const result = await listSkills(db)(params);
    const skillIds = result.data.map((skill) => skill.id);
    const filesBySkillId = await getSkillFilesBySkillIds(db)({
      scopes: params.scopes,
      skillIds,
    });

    return {
      ...result,
      data: result.data.map((skill) => ({
        ...skill,
        files: filesBySkillId[skill.id] ?? [],
      })),
    };
  };

interface WithTenantIdProjectId {
  tenantId: string;
  projectId: string;
}

export const createSkill =
  (db: AgentsManageDatabaseClient) =>
  async (data: SkillApiInsert & WithTenantIdProjectId): Promise<SkillRecordWithFiles> => {
    return await db.transaction(async (tx) => {
      const now = new Date().toISOString();
      const insertData: SkillSelect = {
        tenantId: data.tenantId,
        projectId: data.projectId,
        id: data.name,
        name: data.name,
        description: data.description,
        content: data.content,
        metadata: data.metadata ?? null,
        createdAt: now,
        updatedAt: now,
      };

      const [result] = await tx.insert(skills).values(insertData).returning();

      await replaceSkillFiles(tx, {
        scopes: { tenantId: data.tenantId, projectId: data.projectId },
        skillId: result.id,
        files: data.files,
      });

      const createdSkill = await getSkillByIdWithFiles(tx)({
        scopes: { tenantId: data.tenantId, projectId: data.projectId },
        skillId: result.id,
      });

      if (!createdSkill) {
        throw new Error(`Failed to load created skill "${result.id}"`);
      }

      return createdSkill;
    });
  };

export const upsertSkill =
  (db: AgentsManageDatabaseClient) => async (data: SkillApiInsert & WithTenantIdProjectId) => {
    return await db.transaction(async (tx) => {
      const now = new Date().toISOString();
      const baseData: Omit<SkillSelect, 'createdAt' | 'updatedAt'> = {
        tenantId: data.tenantId,
        projectId: data.projectId,
        id: data.name,
        name: data.name,
        description: data.description,
        content: data.content,
        metadata: data.metadata ?? null,
      };

      const scopes = { tenantId: baseData.tenantId, projectId: baseData.projectId };
      const existing = await tx.query.skills.findFirst({
        where: and(projectScopedWhere(skills, scopes), eq(skills.id, baseData.id)),
      });

      const files = data.files;

      if (existing) {
        const [result] = await tx
          .update(skills)
          .set({
            name: baseData.name,
            description: baseData.description,
            content: baseData.content,
            metadata: baseData.metadata,
            updatedAt: now,
          })
          .where(and(projectScopedWhere(skills, scopes), eq(skills.id, baseData.id)))
          .returning();

        await replaceSkillFiles(tx, {
          scopes: { tenantId: baseData.tenantId, projectId: baseData.projectId },
          skillId: baseData.id,
          files,
        });

        logger.info({ skillId: baseData.id }, 'Updated skill');
        return result;
      }

      const insertData: SkillSelect = {
        ...baseData,
        createdAt: now,
        updatedAt: now,
      };

      const [result] = await tx.insert(skills).values(insertData).returning();
      await replaceSkillFiles(tx, {
        scopes: { tenantId: baseData.tenantId, projectId: baseData.projectId },
        skillId: baseData.id,
        files,
      });

      logger.info({ skillId: baseData.id }, 'Created skill');
      return result;
    });
  };

export const updateSkill =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; skillId: string; data: SkillApiUpdate }) => {
    return await db.transaction(async (tx) => {
      const existing = await tx.query.skills.findFirst({
        where: and(
          eq(skills.tenantId, params.scopes.tenantId),
          eq(skills.projectId, params.scopes.projectId),
          eq(skills.id, params.skillId)
        ),
      });

      if (!existing) {
        return null;
      }
      const { description, metadata, content } = params.data;

      const updateData: Partial<SkillSelect> = {
        updatedAt: new Date().toISOString(),
      };
      if (description !== undefined) updateData.description = description;
      if (metadata !== undefined) updateData.metadata = metadata;
      if (content !== undefined) updateData.content = content;

      if (!params.data.files) {
        throw new Error('Skill updates must include files');
      }

      const [result] = await tx
        .update(skills)
        .set(updateData)
        .where(and(projectScopedWhere(skills, params.scopes), eq(skills.id, params.skillId)))
        .returning();

      await replaceSkillFiles(tx, {
        scopes: params.scopes,
        skillId: params.skillId,
        files: params.data.files,
      });

      return result
        ? await getSkillByIdWithFiles(tx)({
            scopes: params.scopes,
            skillId: params.skillId,
          })
        : null;
    });
  };

export const deleteSkill =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: ProjectScopeConfig; skillId: string }) => {
    const result = await db
      .delete(skills)
      .where(and(projectScopedWhere(skills, params.scopes), eq(skills.id, params.skillId)))
      .returning();

    return result.length > 0;
  };

export const getSkillsForSubAgents =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: AgentScopeConfig;
    subAgentIds: string[];
  }): Promise<SubAgentSkillWithIndex[]> => {
    if (!params.subAgentIds.length) {
      return [];
    }

    return await db
      .select({
        subAgentSkillId: subAgentSkills.id,
        subAgentId: subAgentSkills.subAgentId,
        index: subAgentSkills.index,
        alwaysLoaded: subAgentSkills.alwaysLoaded,
        id: skills.id,
        name: skills.name,
        description: skills.description,
        content: skills.content,
        metadata: skills.metadata,
        createdAt: skills.createdAt,
        updatedAt: skills.updatedAt,
      })
      .from(subAgentSkills)
      .innerJoin(
        skills,
        and(
          eq(subAgentSkills.skillId, skills.id),
          eq(subAgentSkills.tenantId, skills.tenantId),
          eq(subAgentSkills.projectId, skills.projectId)
        )
      )
      .where(
        and(
          agentScopedWhere(subAgentSkills, params.scopes),
          inArray(subAgentSkills.subAgentId, params.subAgentIds)
        )
      )
      .orderBy(asc(subAgentSkills.index), asc(subAgentSkills.createdAt));
  };

export const upsertSubAgentSkill =
  (db: AgentsManageDatabaseClient) =>
  async (params: {
    scopes: SubAgentScopeConfig;
    skillId: string;
    index: number;
    alwaysLoaded?: boolean;
  }) => {
    const now = new Date().toISOString();
    const existing = await db.query.subAgentSkills.findFirst({
      where: and(
        subAgentScopedWhere(subAgentSkills, params.scopes),
        eq(subAgentSkills.skillId, params.skillId)
      ),
    });

    if (existing) {
      const [result] = await db
        .update(subAgentSkills)
        .set({
          index: params.index,
          alwaysLoaded: params.alwaysLoaded ?? existing.alwaysLoaded,
          updatedAt: now,
        })
        .where(eq(subAgentSkills.id, existing.id))
        .returning();

      return result;
    }

    const insertData: SubAgentSkillInsert = {
      ...params.scopes,
      id: deriveRelationId(
        params.scopes.tenantId,
        params.scopes.projectId,
        params.scopes.agentId,
        params.scopes.subAgentId,
        params.skillId
      ),
      skillId: params.skillId,
      index: params.index,
      alwaysLoaded: params.alwaysLoaded ?? false,
      createdAt: now,
      updatedAt: now,
    };

    const [result] = await db.insert(subAgentSkills).values(insertData).returning();
    return result;
  };

export const deleteSubAgentSkill =
  (db: AgentsManageDatabaseClient) =>
  async (params: { scopes: AgentScopeConfig; subAgentSkillId: string }) => {
    const result = await db
      .delete(subAgentSkills)
      .where(
        and(
          agentScopedWhere(subAgentSkills, params.scopes),
          eq(subAgentSkills.id, params.subAgentSkillId)
        )
      )
      .returning();

    return result.length > 0;
  };

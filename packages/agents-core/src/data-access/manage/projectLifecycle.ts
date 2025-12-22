import { sql } from 'drizzle-orm';
import type { AgentsManageDatabaseClient } from '../../db/manage/manage-client';
import type { AgentsRunDatabaseClient } from '../../db/runtime/runtime-client';
import { doltBranch, doltDeleteBranch, doltBranchExists } from '../../dolt/branch';
import {
  createProjectMetadata,
  deleteProjectMetadata,
  getProjectMetadata,
  listProjectsMetadataPaginated,
} from '../runtime/projects';
import type { ProjectMetadataSelect } from '../../types/entities';
import { getLogger } from '../../utils/logger';
import type { PaginationConfig, PaginationResult, ProjectModels } from '../../types/utility';
import type { StopWhen } from '../../validation/schemas';

const logger = getLogger('project-lifecycle');

export interface CreateProjectWithBranchParams {
  tenantId: string;
  projectId: string;
  createdBy?: string;
}

export interface CreateProjectWithBranchResult {
  id: string;
  tenantId: string;
  mainBranchName: string;
  createdAt: string;
  createdBy: string | null;
}

export interface DeleteProjectWithBranchParams {
  tenantId: string;
  projectId: string;
}

/**
 * Generate the main branch name for a project
 */
export function getProjectMainBranchName(tenantId: string, projectId: string): string {
  return `${tenantId}_${projectId}_main`;
}

/**
 * Create a project with its main branch
 *
 * This utility:
 * 1. Creates the project record in the runtime DB (source of truth for existence)
 * 2. Creates the project main branch in the config DB (Doltgres)
 *
 * @param runDb - Runtime database client (Postgres)
 * @param configDb - Config database client (Doltgres)
 */
export const createProjectMetadataAndBranch =
  (runDb: AgentsRunDatabaseClient, configDb: AgentsManageDatabaseClient) =>
  async (params: CreateProjectWithBranchParams): Promise<CreateProjectWithBranchResult> => {
    const { tenantId, projectId, createdBy } = params;
    const mainBranchName = getProjectMainBranchName(tenantId, projectId);

    logger.info({ tenantId, projectId, mainBranchName }, 'Creating project with branch');

    // 1. Create project record in runtime DB
    const runtimeProject = await createProjectMetadata(runDb)({
      id: projectId,
      tenantId,
      createdBy: createdBy ?? null,
      mainBranchName,
    });

    logger.debug({ projectId }, 'Created project in runtime DB');

    // 2. Create the project main branch in config DB
    try {
      // Branch may exist already if project is created in the updated endpoint
      const branchExists = await doltBranchExists(configDb)({ name: mainBranchName });
      if (!branchExists) {
        await doltBranch(configDb)({ name: mainBranchName });
        logger.debug({ mainBranchName }, 'Created project main branch');
      }
    } catch (error) {
      // If branch creation fails, clean up the runtime record
      logger.error({ error, mainBranchName }, 'Failed to create project branch, rolling back');
      await deleteProjectMetadata(runDb)({ tenantId, projectId });
      throw error;
    }

    logger.info(
      { tenantId, projectId, mainBranchName },
      'Successfully created project with branch'
    );

    return {
      id: runtimeProject.id,
      tenantId: runtimeProject.tenantId,
      mainBranchName: runtimeProject.mainBranchName,
      createdAt: runtimeProject.createdAt,
      createdBy: runtimeProject.createdBy,
    };
  };

/**
 * Delete a project and its branch
 *
 * This utility:
 * 1. Gets the project from runtime DB to find the branch name
 * 2. Deletes the project branch from config DB (Doltgres)
 * 3. Deletes the project record from runtime DB
 *
 * Note: Callers should handle cascade deletion of runtime entities (conversations, etc.)
 * before calling this function.
 *
 * @param runDb - Runtime database client (Postgres)
 * @param configDb - Config database client (Doltgres)
 */
export const deleteProjectWithBranch =
  (runDb: AgentsRunDatabaseClient, configDb: AgentsManageDatabaseClient) =>
  async (params: DeleteProjectWithBranchParams): Promise<boolean> => {
    const { tenantId, projectId } = params;

    logger.info({ tenantId, projectId }, 'Deleting project with branch');

    // 1. Get project from runtime DB to find the branch name
    const project = await getProjectMetadata(runDb)({ tenantId, projectId });

    if (!project) {
      logger.warn({ tenantId, projectId }, 'Project not found in runtime DB');
      return false;
    }

    const { mainBranchName } = project;

    // 2. Delete the project branch from config DB
    try {
      await doltDeleteBranch(configDb)({ name: mainBranchName, force: true });
      logger.debug({ mainBranchName }, 'Deleted project branch');
    } catch (error) {
      // Log but continue - the branch might not exist or might have other issues
      // We still want to clean up the runtime record
      logger.error(
        { error, mainBranchName },
        'Failed to delete project branch, continuing with runtime cleanup'
      );
    }

    // 3. Delete from runtime DB
    const deleted = await deleteProjectMetadata(runDb)({ tenantId, projectId });

    if (deleted) {
      logger.info(
        { tenantId, projectId, mainBranchName },
        'Successfully deleted project with branch'
      );
    } else {
      logger.warn({ tenantId, projectId }, 'Failed to delete project from runtime DB');
    }

    return deleted;
  };

/**
 * Get project with branch info
 *
 * Returns the project from runtime DB including the main branch name
 */
export const getProjectWithBranchInfo =
  (runDb: AgentsRunDatabaseClient) =>
  async (params: {
    tenantId: string;
    projectId: string;
  }): Promise<ProjectMetadataSelect | null> => {
    return await getProjectMetadata(runDb)(params);
  };

/**
 * Project metadata from the versioned config DB
 */
export interface ProjectConfigMetadata {
  name: string;
  description: string | null;
  models: ProjectModels | null;
  stopWhen: StopWhen | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Combined project data from runtime + config DBs
 */
export interface ProjectWithMetadata {
  // From runtime DB (source of truth for existence)
  id: string;
  tenantId: string;
  createdAt: string;
  createdBy: string | null;
  mainBranchName: string;
  // From config DB (versioned metadata)
  name: string | null;
  description: string | null;
  models: ProjectModels | null;
  stopWhen: StopWhen | null;
  configUpdatedAt: string | null;
}

export interface ListProjectsWithMetadataResult {
  data: ProjectWithMetadata[];
  pagination: PaginationResult;
}

/**
 * Get project metadata from config DB at a specific branch using AS OF syntax
 *
 * This queries the projects table without checking out the branch
 */
async function getProjectMetadataFromBranch(
  configDb: AgentsManageDatabaseClient,
  branchName: string,
  tenantId: string,
  projectId: string
): Promise<ProjectConfigMetadata | null> {
  try {
    // Use Dolt's AS OF syntax to query at a specific branch point
    const result = await configDb.execute(
      sql.raw(`
        SELECT name, description, models, stop_when, created_at, updated_at
        FROM projects AS OF '${branchName}'
        WHERE tenant_id = '${tenantId}' AND id = '${projectId}'
        LIMIT 1
      `)
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0] as any;
    return {
      name: row.name,
      description: row.description,
      models: row.models,
      stopWhen: row.stop_when,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch (error) {
    logger.warn(
      { error, branchName, tenantId, projectId },
      'Failed to get project metadata from branch'
    );
    return null;
  }
}

/**
 * List projects with metadata from both runtime and config DBs
 *
 * This function:
 * 1. Gets the list of projects from runtime DB (source of truth for existence)
 * 2. For each project, queries the config DB at the project's main branch to get metadata
 *
 * @param runDb - Runtime database client (Postgres)
 * @param configDb - Config database client (Doltgres)
 */
export const listProjectsWithMetadataPaginated =
  (runDb: AgentsRunDatabaseClient, configDb: AgentsManageDatabaseClient) =>
  async (params: {
    tenantId: string;
    pagination?: PaginationConfig;
  }): Promise<ListProjectsWithMetadataResult> => {
    const { tenantId, pagination } = params;

    // 1. Get projects from runtime DB (paginated)
    const projectMetadataResult = await listProjectsMetadataPaginated(runDb)({
      tenantId,
      pagination,
    });

    // 2. For each project, get metadata from config DB at project's main branch
    const projectsWithMetadata = await Promise.all(
      projectMetadataResult.data.map(async (projectMetadata) => {
        const metadata = await getProjectMetadataFromBranch(
          configDb,
          projectMetadata.mainBranchName,
          tenantId,
          projectMetadata.id
        );

        return {
          // Runtime DB fields
          id: projectMetadata.id,
          tenantId: projectMetadata.tenantId,
          createdAt: projectMetadata.createdAt,
          createdBy: projectMetadata.createdBy,
          mainBranchName: projectMetadata.mainBranchName,
          // Config DB fields (may be null if project exists but has no config data yet)
          name: metadata?.name ?? null,
          description: metadata?.description ?? null,
          models: metadata?.models ?? null,
          stopWhen: metadata?.stopWhen ?? null,
          configUpdatedAt: metadata?.updatedAt ?? null,
        };
      })
    );

    return {
      data: projectsWithMetadata,
      pagination: projectMetadataResult.pagination,
    };
  };

/**
 * Get a single project with metadata from both runtime and config DBs
 *
 * @param runDb - Runtime database client (Postgres)
 * @param configDb - Config database client (Doltgres)
 */
export const getProjectWithMetadata =
  (runDb: AgentsRunDatabaseClient, configDb: AgentsManageDatabaseClient) =>
  async (params: { tenantId: string; projectId: string }): Promise<ProjectWithMetadata | null> => {
    const { tenantId, projectId } = params;

    // 1. Get project from runtime DB
    const runtimeProject = await getProjectMetadata(runDb)({ tenantId, projectId });

    if (!runtimeProject) {
      return null;
    }

    // 2. Get metadata from config DB at project's main branch
    const metadata = await getProjectMetadataFromBranch(
      configDb,
      runtimeProject.mainBranchName,
      tenantId,
      projectId
    );

    return {
      // Runtime DB fields
      id: runtimeProject.id,
      tenantId: runtimeProject.tenantId,
      createdAt: runtimeProject.createdAt,
      createdBy: runtimeProject.createdBy,
      mainBranchName: runtimeProject.mainBranchName,
      // Config DB fields
      name: metadata?.name ?? null,
      description: metadata?.description ?? null,
      models: metadata?.models ?? null,
      stopWhen: metadata?.stopWhen ?? null,
      configUpdatedAt: metadata?.updatedAt ?? null,
    };
  };

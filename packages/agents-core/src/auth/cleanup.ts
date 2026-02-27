import { drizzle } from 'drizzle-orm/node-postgres';
import type { Pool } from 'pg';
import { deleteScheduledTriggersByRunAsUserId } from '../data-access/manage/scheduledTriggers';
import { deleteTriggersByRunAsUserId } from '../data-access/manage/triggers';
import { listProjectsMetadata } from '../data-access/runtime/projects';
import type { AgentsManageDatabaseClient } from '../db/manage/manage-client';
import * as schema from '../db/manage/manage-schema';
import type { AgentsRunDatabaseClient } from '../db/runtime/runtime-client';
import { resolveProjectMainRefs } from '../dolt/ref-helpers';
import { withRef } from '../dolt/ref-scope';
import { getLogger } from '../utils/logger';
import type { ResolvedRef } from '../validation/dolt-schemas';

const logger = getLogger('auth-cleanup');

export async function cleanupUserScheduledTriggers(params: {
  tenantId: string;
  userId: string;
  runDb: AgentsRunDatabaseClient;
  manageDbPool: Pool;
}): Promise<void> {
  const { tenantId, userId, runDb, manageDbPool } = params;

  const projects = await listProjectsMetadata(runDb)({ tenantId });
  if (projects.length === 0) return;

  const connection = await manageDbPool.connect();
  let resolvedRefs: Array<{ projectId: string; ref: ResolvedRef }>;
  try {
    const db = drizzle(connection, { schema }) as unknown as AgentsManageDatabaseClient;
    resolvedRefs = await resolveProjectMainRefs(db)(
      tenantId,
      projects.map((p) => p.id)
    );
  } finally {
    connection.release();
  }

  const results = await Promise.allSettled(
    resolvedRefs.map(({ projectId, ref }) =>
      withRef(
        manageDbPool,
        ref,
        async (db) => {
          await deleteScheduledTriggersByRunAsUserId(db)({
            tenantId,
            projectId,
            runAsUserId: userId,
          });
          await deleteTriggersByRunAsUserId(db)({ tenantId, projectId, runAsUserId: userId });
        },
        {
          commit: true,
          commitMessage: `Remove triggers for departing user ${userId}`,
        }
      )
    )
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const { projectId } = resolvedRefs[i];
    if (result.status === 'rejected') {
      logger.error(
        { tenantId, projectId, userId, error: result.reason },
        'Failed to clean up scheduled triggers for project'
      );
    }
  }
}

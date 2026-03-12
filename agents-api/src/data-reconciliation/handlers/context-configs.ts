import type { OrphanedRuntimeRowsResult } from '@inkeep/agents-core';
import {
  cascadeDeleteByContextConfig,
  defineHandlers,
  listContextCacheByProject,
  listContextConfigIdsByProject,
} from '@inkeep/agents-core';

export const contextConfigsHandlers = defineHandlers('context_configs', {
  onDeleted: async (before, ctx) => {
    await cascadeDeleteByContextConfig(ctx.runDb)({
      scopes: ctx.scopes,
      contextConfigId: before.id,
      fullBranchName: ctx.fullBranchName,
    });
  },
  check: async (ctx): Promise<OrphanedRuntimeRowsResult> => {
    const [existingConfigIdsList, cacheEntries] = await Promise.all([
      listContextConfigIdsByProject(ctx.manageDb)({ scopes: ctx.scopes }),
      listContextCacheByProject(ctx.runDb)({ scopes: ctx.scopes }),
    ]);
    const existingConfigIds = new Set(existingConfigIdsList);

    return {
      orphanedRows: cacheEntries
        .filter((e) => !existingConfigIds.has(e.contextConfigId))
        .map((e) => ({
          table: 'context_cache',
          id: e.id,
          referencedEntityId: e.contextConfigId,
        })),
    };
  },
});

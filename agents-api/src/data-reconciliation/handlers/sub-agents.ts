import { cascadeDeleteBySubAgent, defineHandlers } from '@inkeep/agents-core';

export const subAgentsHandlers = defineHandlers('sub_agents', {
  onDeleted: async (before, ctx) => {
    await cascadeDeleteBySubAgent(ctx.runDb)({
      scopes: {
        tenantId: ctx.scopes.tenantId,
        projectId: ctx.scopes.projectId,
      },
      subAgentId: before.id,
      fullBranchName: ctx.fullBranchName,
    });
  },
});

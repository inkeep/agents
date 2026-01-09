import { getArtifactComponentsForAgent } from '@inkeep/agents-core';
import { createTestProject } from '@inkeep/agents-core/db/test-manage-client';
import { beforeAll, describe, expect, it } from 'vitest';
import manageDbClient from '../../data/db/dbClient';
import { createTestTenantWithOrg } from '../utils/testTenant';

describe('Artifact Components Data Operations', () => {
  describe('getArtifactComponentsForAgent', () => {
    it.skip('should return empty array for non-existent agent', async () => {
      const tenantId = await createTestTenantWithOrg('agent-non-existent');

      beforeAll(async () => {
        await createTestProject(manageDbClient, tenantId, 'default');
      });
      const projectId = 'default';
      const subAgentId = 'non-existent-sub-agent';
      const agentId = 'non-existent-agent';

      const components = await getArtifactComponentsForAgent(manageDbClient)({
        scopes: { tenantId, projectId, agentId: agentId, subAgentId },
      });
      expect(components).toEqual([]);
    });
  });
});

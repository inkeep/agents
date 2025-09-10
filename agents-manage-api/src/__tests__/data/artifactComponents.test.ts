import { getArtifactComponentsForAgent } from '@inkeep/agents-core';
import { beforeAll, describe, expect, it } from 'vitest';
import dbClient from '../../data/db/dbClient.js';
import { ensureTestProject } from '../utils/testProject.js';
import { createTestTenantId } from '../utils/testTenant.js';

describe('Artifact Components Data Operations', () => {
  describe('getArtifactComponentsForAgent', () => {
    it('should return empty array for non-existent agent', async () => {
      const tenantId = createTestTenantId('agent-non-existent');

      beforeAll(async () => {
        await ensureTestProject(tenantId, 'default');
      });
      const projectId = 'default';
      const agentId = 'non-existent-agent';

      const components = await getArtifactComponentsForAgent(dbClient)({
        scopes: { tenantId, projectId },
        agentId,
      });
      expect(components).toEqual([]);
    });
  });
});

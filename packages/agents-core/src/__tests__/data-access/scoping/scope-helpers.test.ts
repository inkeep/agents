import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import {
  agentScopedWhere,
  projectScopedWhere,
  subAgentScopedWhere,
  tenantScopedWhere,
} from '../../../data-access/manage/scope-helpers';
import { agents, subAgents, subAgentToolRelations, tools } from '../../../db/manage/manage-schema';

describe('scope-helpers', () => {
  describe('tenantScopedWhere', () => {
    it('should produce eq on tenantId', () => {
      const result = tenantScopedWhere(agents, { tenantId: 't1' });
      const expected = eq(agents.tenantId, 't1');
      expect(result).toEqual(expected);
    });
  });

  describe('projectScopedWhere', () => {
    it('should produce and(eq tenantId, eq projectId)', () => {
      const result = projectScopedWhere(tools, { tenantId: 't1', projectId: 'p1' });
      const expected = and(eq(tools.tenantId, 't1'), eq(tools.projectId, 'p1'));
      expect(result).toEqual(expected);
    });
  });

  describe('agentScopedWhere', () => {
    it('should produce and(eq tenantId, eq projectId, eq agentId)', () => {
      const result = agentScopedWhere(subAgents, {
        tenantId: 't1',
        projectId: 'p1',
        agentId: 'a1',
      });
      const expected = and(
        eq(subAgents.tenantId, 't1'),
        eq(subAgents.projectId, 'p1'),
        eq(subAgents.agentId, 'a1')
      );
      expect(result).toEqual(expected);
    });
  });

  describe('subAgentScopedWhere', () => {
    it('should produce and(eq tenantId, eq projectId, eq agentId, eq subAgentId)', () => {
      const result = subAgentScopedWhere(subAgentToolRelations, {
        tenantId: 't1',
        projectId: 'p1',
        agentId: 'a1',
        subAgentId: 'sa1',
      });
      const expected = and(
        eq(subAgentToolRelations.tenantId, 't1'),
        eq(subAgentToolRelations.projectId, 'p1'),
        eq(subAgentToolRelations.agentId, 'a1'),
        eq(subAgentToolRelations.subAgentId, 'sa1')
      );
      expect(result).toEqual(expected);
    });
  });
});

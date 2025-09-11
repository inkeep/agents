import { describe, expect, it } from 'vitest';
import { agentRelation } from '../../builderFunctionsExperimental';

describe('agentRelation experimental function', () => {
  it('should create a transfer relation by default', () => {
    const relation = agentRelation('support-agent');

    expect(relation.targetAgent).toBe('support-agent');
    expect(relation.relationType).toBe('transfer');
  });

  it('should create a transfer relation explicitly', () => {
    const relation = agentRelation('support-agent', 'transfer');

    expect(relation.targetAgent).toBe('support-agent');
    expect(relation.relationType).toBe('transfer');
  });

  it('should create a delegate relation', () => {
    const relation = agentRelation('specialist-agent', 'delegate');

    expect(relation.targetAgent).toBe('specialist-agent');
    expect(relation.relationType).toBe('delegate');
  });

  it('should handle various agent ID formats', () => {
    const kebabCaseRelation = agentRelation('kebab-case-agent');
    const camelCaseRelation = agentRelation('camelCaseAgent');
    const underscoreRelation = agentRelation('underscore_agent');

    expect(kebabCaseRelation.targetAgent).toBe('kebab-case-agent');
    expect(camelCaseRelation.targetAgent).toBe('camelCaseAgent');
    expect(underscoreRelation.targetAgent).toBe('underscore_agent');
  });

  it('should return correct structure for both relation types', () => {
    const transferRelation = agentRelation('agent-1', 'transfer');
    const delegateRelation = agentRelation('agent-2', 'delegate');

    // Check structure
    expect(Object.keys(transferRelation)).toEqual(['targetAgent', 'relationType']);
    expect(Object.keys(delegateRelation)).toEqual(['targetAgent', 'relationType']);

    // Check values
    expect(transferRelation).toEqual({
      targetAgent: 'agent-1',
      relationType: 'transfer',
    });

    expect(delegateRelation).toEqual({
      targetAgent: 'agent-2',
      relationType: 'delegate',
    });
  });
});

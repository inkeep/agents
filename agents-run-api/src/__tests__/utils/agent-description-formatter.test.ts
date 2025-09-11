import { describe, expect, it } from 'vitest';
import {
  categorizeRelations,
  formatTransferAndDelegateInfo,
  generateEnhancedDescription,
  type CombinedRelationInfo,
  type ExternalRelationInfo,
  type RelationInfo,
} from '../../utils/agent-description-formatter';

describe('agent-description-formatter', () => {
  describe('formatTransferAndDelegateInfo', () => {
    it('should return empty string when no relations exist', () => {
      const result = formatTransferAndDelegateInfo([], []);
      expect(result).toBe('');
    });

    it('should format transfer relations correctly', () => {
      const transfers: CombinedRelationInfo[] = [
        {
          id: 'agent1',
          name: 'Search Agent',
          description: 'Handles search queries',
          relationType: 'transfer',
        },
        {
          id: 'agent2',
          name: 'Analytics Agent',
          description: 'Processes analytics data',
          relationType: 'transfer',
        },
      ];

      const result = formatTransferAndDelegateInfo(transfers, []);
      expect(result).toBe(`

Can transfer to:
- Search Agent: Handles search queries
- Analytics Agent: Processes analytics data`);
    });

    it('should format delegate relations correctly', () => {
      const delegates: CombinedRelationInfo[] = [
        {
          id: 'agent3',
          name: 'Helper Agent',
          description: 'Provides assistance',
          relationType: 'delegate',
        },
      ];

      const result = formatTransferAndDelegateInfo([], delegates);
      expect(result).toBe(`

Can delegate to:
- Helper Agent: Provides assistance`);
    });

    it('should format both transfers and delegates', () => {
      const transfers: CombinedRelationInfo[] = [
        {
          id: 'agent1',
          name: 'Search Agent',
          description: 'Handles search queries',
          relationType: 'transfer',
        },
      ];

      const delegates: CombinedRelationInfo[] = [
        {
          id: 'agent2',
          name: 'Helper Agent',
          description: 'Provides assistance',
          relationType: 'delegate',
        },
      ];

      const result = formatTransferAndDelegateInfo(transfers, delegates);
      expect(result).toBe(`

Can transfer to:
- Search Agent: Handles search queries

Can delegate to:
- Helper Agent: Provides assistance`);
    });

    it('should handle external relations with externalAgent property', () => {
      const transfers: ExternalRelationInfo[] = [
        {
          id: 'ext1',
          name: 'External Relation',
          description: 'External description',
          relationType: 'transfer',
          externalAgent: {
            name: 'External Search Agent',
            description: 'External agent for search',
          },
        },
      ];

      const result = formatTransferAndDelegateInfo(transfers, []);
      expect(result).toBe(`

Can transfer to:
- External Search Agent: External agent for search`);
    });

    it('should handle relations with empty descriptions', () => {
      const transfers: CombinedRelationInfo[] = [
        {
          id: 'agent1',
          name: 'Agent Without Description',
          description: '',
          relationType: 'transfer',
        },
        {
          id: 'agent2',
          name: 'Agent With Null Description',
          description: null,
          relationType: 'transfer',
        },
      ];

      const result = formatTransferAndDelegateInfo(transfers, []);
      expect(result).toBe(`

Can transfer to:
- Agent Without Description: 
- Agent With Null Description: `);
    });
  });

  describe('generateEnhancedDescription', () => {
    it('should return base description when no relations exist', () => {
      const result = generateEnhancedDescription('Base description', [], []);
      expect(result).toBe('Base description');
    });

    it('should append connection info to base description', () => {
      const transfers: CombinedRelationInfo[] = [
        {
          id: 'agent1',
          name: 'Search Agent',
          description: 'Handles search',
          relationType: 'transfer',
        },
      ];

      const result = generateEnhancedDescription('Main agent description', transfers, []);
      expect(result).toBe(`Main agent description

Can transfer to:
- Search Agent: Handles search`);
    });
  });

  describe('categorizeRelations', () => {
    it('should categorize relations by type correctly', () => {
      const internalRelations: RelationInfo[] = [
        {
          id: 'agent1',
          name: 'Transfer Agent',
          description: 'Transfer agent',
          relationType: 'transfer',
        },
        {
          id: 'agent2',
          name: 'Delegate Agent',
          description: 'Delegate agent',
          relationType: 'delegate',
        },
      ];

      const externalRelations: ExternalRelationInfo[] = [
        {
          id: 'ext1',
          name: 'External Transfer',
          description: 'External transfer',
          relationType: 'transfer',
          externalAgent: {
            name: 'External Agent',
            description: 'External description',
          },
        },
      ];

      const { transfers, delegates } = categorizeRelations(internalRelations, externalRelations);

      expect(transfers).toHaveLength(2);
      expect(delegates).toHaveLength(1);
      expect(transfers[0].name).toBe('Transfer Agent');
      expect(transfers[1].id).toBe('ext1');
      expect(delegates[0].name).toBe('Delegate Agent');
    });

    it('should handle empty relations arrays', () => {
      const { transfers, delegates } = categorizeRelations([], []);
      expect(transfers).toHaveLength(0);
      expect(delegates).toHaveLength(0);
    });
  });
});
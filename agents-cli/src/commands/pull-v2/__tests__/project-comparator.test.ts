import { describe, expect, it } from 'vitest';
import { compareProjects, getDiffSummary } from '../project-comparator';
import type { FullProjectDefinition } from '@inkeep/agents-core';

describe('project-comparator', () => {
  const baseProject: FullProjectDefinition = {
    id: 'test-project',
    name: 'Test Project',
    description: 'A test project',
    models: {
      base: { model: 'claude-sonnet-4' }
    },
    agents: {
      'agent-1': {
        id: 'agent-1',
        name: 'Test Agent',
        description: 'Test description',
        subAgents: {
          'sub-1': {
            id: 'sub-1',
            name: 'Sub Agent',
            type: 'internal',
            canUse: []
          }
        }
      }
    },
    tools: {
      'tool-1': {
        id: 'tool-1',
        name: 'Test Tool',
        type: 'function'
      }
    },
    credentialReferences: {
      'cred-1': {
        id: 'cred-1',
        type: 'memory',
        credentialStoreId: 'store-1',
        retrievalParams: {}
      }
    }
  } as any;

  describe('compareProjects', () => {
    it('should return no changes for identical projects', () => {
      const diff = compareProjects(baseProject, baseProject);
      
      expect(diff.hasChanges).toBe(false);
      expect(diff.summary.totalChanges).toBe(0);
    });

    it('should detect when starting from null (all new)', () => {
      const diff = compareProjects(null, baseProject);
      
      expect(diff.hasChanges).toBe(true);
      expect(diff.agents.added).toEqual(['agent-1']);
      expect(diff.tools.added).toEqual(['tool-1']);
      expect(diff.credentials.added).toEqual(['cred-1']);
      expect(diff.subAgents.added).toEqual([{ agentId: 'agent-1', subAgentId: 'sub-1' }]);
    });

    it('should detect project info changes', () => {
      const modified = {
        ...baseProject,
        name: 'Modified Project Name'
      };
      
      const diff = compareProjects(baseProject, modified);
      
      expect(diff.projectInfo).toBe(true);
      expect(diff.hasChanges).toBe(true);
    });

    it('should detect added agents', () => {
      const modified = {
        ...baseProject,
        agents: {
          ...baseProject.agents,
          'agent-2': {
            id: 'agent-2',
            name: 'New Agent',
            subAgents: {}
          }
        }
      };
      
      const diff = compareProjects(baseProject, modified);
      
      expect(diff.agents.added).toEqual(['agent-2']);
      expect(diff.agents.modified).toEqual([]);
      expect(diff.agents.deleted).toEqual([]);
    });

    it('should detect modified agents', () => {
      const modified = {
        ...baseProject,
        agents: {
          'agent-1': {
            ...baseProject.agents['agent-1'],
            name: 'Modified Agent Name'
          }
        }
      };
      
      const diff = compareProjects(baseProject, modified);
      
      expect(diff.agents.modified).toEqual(['agent-1']);
      expect(diff.agents.added).toEqual([]);
      expect(diff.agents.deleted).toEqual([]);
    });

    it('should detect deleted agents', () => {
      const modified = {
        ...baseProject,
        agents: {}
      };
      
      const diff = compareProjects(baseProject, modified);
      
      expect(diff.agents.deleted).toEqual(['agent-1']);
      expect(diff.agents.added).toEqual([]);
      expect(diff.agents.modified).toEqual([]);
    });

    it('should detect sub-agent changes', () => {
      const modified = {
        ...baseProject,
        agents: {
          'agent-1': {
            ...baseProject.agents['agent-1'],
            subAgents: {
              'sub-1': {
                ...baseProject.agents['agent-1'].subAgents['sub-1'],
                name: 'Modified Sub Agent'
              },
              'sub-2': {
                id: 'sub-2',
                name: 'New Sub Agent',
                type: 'internal',
                canUse: []
              }
            }
          }
        }
      };
      
      const diff = compareProjects(baseProject, modified);
      
      expect(diff.subAgents.modified).toEqual([{ agentId: 'agent-1', subAgentId: 'sub-1' }]);
      expect(diff.subAgents.added).toEqual([{ agentId: 'agent-1', subAgentId: 'sub-2' }]);
    });

    it('should handle optional fields properly', () => {
      const minimal: FullProjectDefinition = {
        id: 'minimal',
        name: 'Minimal',
        models: { base: { model: 'claude' } },
        agents: {},
        tools: {}
      };
      
      const diff = compareProjects(minimal, baseProject);
      
      expect(diff.hasChanges).toBe(true);
      expect(diff.agents.added).toEqual(['agent-1']);
      expect(diff.tools.added).toEqual(['tool-1']);
      expect(diff.credentials.added).toEqual(['cred-1']);
    });
  });

  describe('getDiffSummary', () => {
    it('should return no changes message', () => {
      const diff = compareProjects(baseProject, baseProject);
      const summary = getDiffSummary(diff);
      
      expect(summary).toBe('✅ No changes detected');
    });

    it('should return detailed summary for changes', () => {
      const modified = {
        ...baseProject,
        name: 'Modified Project',
        agents: {
          'agent-2': {
            id: 'agent-2',
            name: 'New Agent',
            subAgents: {}
          }
        }
      };
      
      const diff = compareProjects(baseProject, modified);
      const summary = getDiffSummary(diff);
      
      expect(summary).toContain('Found');
      expect(summary).toContain('changes');
      expect(summary).toContain('Project info changed');
      expect(summary).toContain('agents:');
      expect(summary).toContain('deleted');
    });
  });
});
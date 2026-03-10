import { describe, expect, it } from 'vitest';
import { isValidManageTable, managePkMap } from '../pk-map';

describe('managePkMap', () => {
  it('contains all expected manage schema tables', () => {
    const tableNames = Object.keys(managePkMap);
    expect(tableNames.length).toBeGreaterThanOrEqual(30);
  });

  it('has correct composite PK for agent table (project-scoped)', () => {
    expect(managePkMap['agent']).toEqual(['tenant_id', 'project_id', 'id']);
  });

  it('has correct PK for projects table (tenant-scoped)', () => {
    expect(managePkMap['projects']).toEqual(['tenant_id', 'id']);
  });

  it('has correct composite PK for junction table (sub_agent_tool_relations)', () => {
    expect(managePkMap['sub_agent_tool_relations']).toEqual([
      'tenant_id',
      'project_id',
      'agent_id',
      'id',
    ]);
  });

  it('has correct composite PK for triggers (agent-scoped)', () => {
    expect(managePkMap['triggers']).toEqual(['tenant_id', 'project_id', 'agent_id', 'id']);
  });
});

describe('isValidManageTable', () => {
  it('returns true for valid table names', () => {
    expect(isValidManageTable('agent')).toBe(true);
    expect(isValidManageTable('projects')).toBe(true);
    expect(isValidManageTable('triggers')).toBe(true);
  });

  it('returns false for invalid table names', () => {
    expect(isValidManageTable('nonexistent_table')).toBe(false);
    expect(isValidManageTable('')).toBe(false);
    expect(isValidManageTable('DROP TABLE agent')).toBe(false);
  });
});

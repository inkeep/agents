import { ac } from '@inkeep/agents-core/auth/permissions';
import { describe, expect, it } from 'vitest';

describe('RBAC Permission Definitions', () => {
  describe('Access Control Statements', () => {
    it('should define all required resource permissions', () => {
      const statements = ac.statements;

      // Verify all custom resources have full CRUD
      expect(statements.project).toEqual(['create', 'read', 'update', 'delete']);
      expect(statements.agent).toEqual(['create', 'read', 'update', 'delete']);
      expect(statements.tool).toEqual(['create', 'read', 'update', 'delete']);
      expect(statements.api_key).toEqual(['create', 'read', 'update', 'delete']);
      expect(statements.credential).toEqual(['create', 'read', 'update', 'delete']);
      expect(statements.data_component).toEqual(['create', 'read', 'update', 'delete']);
      expect(statements.artifact_component).toEqual(['create', 'read', 'update', 'delete']);
      expect(statements.external_agent).toEqual(['create', 'read', 'update', 'delete']);
      expect(statements.function).toEqual(['create', 'read', 'update', 'delete']);
    });

    it('should include Better Auth default organization statements', () => {
      const statements = ac.statements;

      // Default org management permissions (no "read" by design)
      expect(statements.organization).toEqual(['update', 'delete']);
      expect(statements.member).toEqual(['create', 'update', 'delete']);
      expect(statements.invitation).toEqual(['create', 'cancel']);
      expect(statements.team).toEqual(['create', 'update', 'delete']);
    });

    it('should define access control resource with full CRUD', () => {
      const statements = ac.statements;

      // The "ac" resource has full CRUD (used for permission management)
      expect(statements.ac).toEqual(['create', 'read', 'update', 'delete']);
    });
  });

  describe('Statement Structure', () => {
    it('should ensure all resources have consistent permission sets', () => {
      const resources = [
        'project',
        'agent',
        'tool',
        'api_key',
        'credential',
        'data_component',
        'artifact_component',
        'external_agent',
        'function',
      ] as const;

      for (const resource of resources) {
        const permissions = ac.statements[resource];
        expect(permissions).toBeDefined();
        expect(permissions).toContain('create');
        expect(permissions).toContain('read');
        expect(permissions).toContain('update');
        expect(permissions).toContain('delete');
        expect(permissions.length).toBe(4);
      }
    });
  });
});

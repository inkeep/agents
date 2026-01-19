import { ac, adminRole, memberRole, ownerRole } from '@inkeep/agents-core/auth/permissions';
import { describe, expect, it } from 'vitest';

/**
 * RBAC Permission Tests
 *
 * Better Auth RBAC is used for organization-level roles and permissions.
 * Project-level resource permissions (agents, tools, etc.) are handled by SpiceDB.
 *
 * Architecture:
 * - Better Auth: org roles (owner, admin, member) + org resources (organization, member, invitation, team)
 * - SpiceDB: project-level permissions (view, use, edit, delete) for project resources
 */
describe('RBAC Permission Definitions', () => {
  describe('Access Control Statements', () => {
    it('should define project resource with full CRUD', () => {
      const statements = ac.statements;

      // Project is the only custom resource in Better Auth
      // Actual project permissions are checked via SpiceDB
      expect(statements.project).toEqual(['create', 'read', 'update', 'delete']);
    });

    it('should include Better Auth default organization statements', () => {
      const statements = ac.statements;

      // Default org management permissions from Better Auth
      expect(statements.organization).toEqual(['update', 'delete']);
      expect(statements.member).toEqual(['create', 'update', 'delete']);
      expect(statements.invitation).toEqual(['create', 'cancel']);
      expect(statements.team).toEqual(['create', 'update', 'delete']);
    });
  });

  describe('Organization Roles', () => {
    it('should define owner role with full project permissions', () => {
      expect(ownerRole.statements.project).toEqual(['create', 'read', 'update', 'delete']);
    });

    it('should define admin role with full project permissions', () => {
      expect(adminRole.statements.project).toEqual(['create', 'read', 'update', 'delete']);
    });

    it('should define member role with read-only project permissions', () => {
      // Members only have read access at the org level
      // Project-level permissions are granted via SpiceDB project roles
      expect(memberRole.statements.project).toEqual(['read']);
    });
  });

  describe('SpiceDB Integration Notes', () => {
    it('should document that project-level resources use SpiceDB', () => {
      // This test documents the architecture decision
      // Project-level resources (agents, tools, api_keys, etc.) are NOT in Better Auth
      // They are protected by SpiceDB permissions: view, use, edit, delete

      const statements = ac.statements;

      // These resources are NOT defined in Better Auth (handled by SpiceDB)
      expect(statements.agent).toBeUndefined();
      expect(statements.tool).toBeUndefined();
      expect(statements.api_key).toBeUndefined();
      expect(statements.credential).toBeUndefined();
      expect(statements.data_component).toBeUndefined();
      expect(statements.artifact_component).toBeUndefined();
      expect(statements.external_agent).toBeUndefined();
      expect(statements.function).toBeUndefined();
    });
  });
});

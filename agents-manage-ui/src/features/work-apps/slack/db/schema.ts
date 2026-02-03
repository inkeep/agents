/**
 * Local Storage Database Schema
 *
 * Simplified schema for local workspace and audit log storage.
 * OAuth tokens are managed by Nango (not stored here).
 */

export type IntegrationType = 'slack' | 'teams' | 'discord';

export interface WorkspaceRecord {
  id: string;
  tenantId: string;
  integrationType: IntegrationType;
  externalId: string;
  enterpriseId?: string;
  enterpriseName?: string;
  name: string;
  domain?: string;
  isEnterpriseInstall: boolean;
  botUserId?: string;
  botScopes?: string;
  installedByUserId: string;
  installedByUserEmail?: string;
  installedByExternalUserId?: string;
  installedAt: string;
  updatedAt: string;
  connectionId?: string;
  metadata: Record<string, unknown>;
}

export interface AuditLogRecord {
  id: string;
  tenantId: string;
  userId?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  integrationType?: IntegrationType;
  details: Record<string, unknown>;
  createdAt: string;
}

export interface DatabaseState {
  workspaces: WorkspaceRecord[];
  auditLogs: AuditLogRecord[];
  lastUpdatedAt: string;
}

export const DB_STORAGE_KEY = 'inkeep-slack-local-db';

export const INITIAL_DB_STATE: DatabaseState = {
  workspaces: [],
  auditLogs: [],
  lastUpdatedAt: new Date().toISOString(),
};

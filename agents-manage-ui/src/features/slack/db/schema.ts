/**
 * Local Storage Database Schema
 *
 * These types mirror what the PostgreSQL schema will look like.
 * For now, data is stored in localStorage but structured for easy migration.
 *
 * KEY DESIGN DECISIONS:
 * 1. Slack OAuth tokens are managed by Nango (not stored here)
 * 2. Inkeep API calls from Slack use service-to-service auth (bypass secret)
 * 3. We store user identity mapping, not tokens
 */

export type IntegrationType = 'slack' | 'teams' | 'discord' | 'linear' | 'notion';

/**
 * Slack App Configuration
 * Represents a registered Slack app (could be different apps per environment)
 */
export interface SlackAppRecord {
  id: string;
  clientId: string;
  appId: string;
  name: string;
  signingSecret?: string;
  environment: 'development' | 'staging' | 'production';
  createdAt: string;
  updatedAt: string;
}

/**
 * Workspaces Table
 * Represents an installed integration workspace (e.g., Slack workspace, Teams tenant)
 *
 * For Slack: externalId = teamId, enterpriseId for grid orgs
 * Fully qualified ID = slackWorkspaceId + slackEnterpriseId
 */
export interface WorkspaceRecord {
  id: string;
  tenantId: string;
  integrationType: IntegrationType;
  slackAppId?: string;
  externalId: string;
  enterpriseId?: string;
  enterpriseName?: string;
  name: string;
  domain?: string;
  iconUrl?: string;
  isEnterpriseInstall: boolean;
  botUserId?: string;
  botToken?: string;
  botScopes?: string;
  installedByUserId: string;
  installedByUserEmail?: string;
  installedByExternalUserId?: string;
  installedAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

/**
 * Users Table
 * Represents an Inkeep platform user
 *
 * Note: We don't store Inkeep OAuth tokens here.
 * The Slack bot uses service-to-service auth (bypass secret) to make API calls.
 */
export interface UserRecord {
  id: string;
  tenantId: string;
  organizationId: string;
  email: string;
  name?: string;
  avatarUrl?: string;
  role: 'admin' | 'member' | 'viewer';
  createdAt: string;
  updatedAt: string;
  metadata: Record<string, unknown>;
}

/**
 * Slack User Connection
 * Links a Slack user to an Inkeep user
 *
 * This is the core mapping that enables:
 * - Slack user → Inkeep user identity
 * - tenantId for API scoping
 * - Nango connection for Slack API access
 *
 * The Slack bot makes Inkeep API calls using:
 * - Service bypass secret (trusted internal service)
 * - tenantId + inkeepUserId for authorization context
 */
export interface SlackUserConnection {
  id: string;

  slackUserId: string;
  slackWorkspaceId: string;
  slackEnterpriseId?: string;
  slackUsername?: string;
  slackDisplayName?: string;
  slackEmail?: string;
  isSlackAdmin: boolean;
  isSlackOwner: boolean;

  inkeepUserId: string;
  inkeepUserEmail?: string;
  inkeepUserName?: string;
  tenantId: string;
  organizationId: string;

  slackAppClientId: string;
  nangoConnectionId: string;
  nangoIntegrationId: string;

  connectedAt: string;
  lastSyncAt?: string;
  lastActiveAt?: string;
  status: 'active' | 'inactive' | 'revoked';

  metadata: Record<string, unknown>;
}

/**
 * Connections Table (Generic - for non-Slack integrations)
 * Links an Inkeep user to an external integration account
 */
export interface ConnectionRecord {
  id: string;
  tenantId: string;
  userId: string;
  integrationType: IntegrationType;
  workspaceId: string;
  externalUserId: string;
  externalUserEmail?: string;
  externalDisplayName?: string;
  externalUsername?: string;
  isExternalAdmin: boolean;
  isExternalOwner: boolean;
  nangoConnectionId: string;
  linkedAt: string;
  lastActiveAt?: string;
  status: 'active' | 'inactive' | 'revoked';
  metadata: Record<string, unknown>;
}

/**
 * Audit Log Table
 * Tracks important actions for debugging and compliance
 */
export interface AuditLogRecord {
  id: string;
  tenantId: string;
  userId?: string;
  action:
    | 'workspace.install'
    | 'workspace.uninstall'
    | 'connection.create'
    | 'connection.delete'
    | 'connection.disconnect'
    | 'connection.clear_all'
    | 'command.execute';
  resourceType: 'workspace' | 'connection' | 'command';
  resourceId?: string;
  integrationType: IntegrationType;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
  createdAt: string;
}

/**
 * Database State
 * Complete state stored in localStorage
 */
export interface DatabaseState {
  version: number;
  slackApps: SlackAppRecord[];
  workspaces: WorkspaceRecord[];
  users: UserRecord[];
  slackUserConnections: SlackUserConnection[];
  connections: ConnectionRecord[];
  auditLogs: AuditLogRecord[];
  lastUpdatedAt: string;
}

export const INITIAL_DB_STATE: DatabaseState = {
  version: 2,
  slackApps: [],
  workspaces: [],
  users: [],
  slackUserConnections: [],
  connections: [],
  auditLogs: [],
  lastUpdatedAt: new Date().toISOString(),
};

export const DB_STORAGE_KEY = 'inkeep_slack_db';

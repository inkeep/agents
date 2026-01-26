'use client';

import {
  type AuditLogRecord,
  type ConnectionRecord,
  type DatabaseState,
  DB_STORAGE_KEY,
  INITIAL_DB_STATE,
  type IntegrationType,
  type SlackUserConnection,
  type UserRecord,
  type WorkspaceRecord,
} from './schema';

const logger = {
  info: (msg: string, data?: Record<string, unknown>) => {
    console.log(`[LocalDB] ${msg}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (msg: string, error?: unknown) => {
    console.error(`[LocalDB] ERROR: ${msg}`, error);
  },
  debug: (msg: string, data?: Record<string, unknown>) => {
    console.log(`[LocalDB] DEBUG: ${msg}`, data ? JSON.stringify(data, null, 2) : '');
  },
};

function getState(): DatabaseState {
  if (typeof window === 'undefined') return INITIAL_DB_STATE;

  try {
    const stored = localStorage.getItem(DB_STORAGE_KEY);
    if (!stored) return INITIAL_DB_STATE;
    return JSON.parse(stored) as DatabaseState;
  } catch (error) {
    logger.error('Failed to read database state', error);
    return INITIAL_DB_STATE;
  }
}

function setState(state: DatabaseState): void {
  if (typeof window === 'undefined') return;

  try {
    state.lastUpdatedAt = new Date().toISOString();
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(state));
    logger.debug('Database state updated', { lastUpdatedAt: state.lastUpdatedAt });
  } catch (error) {
    logger.error('Failed to save database state', error);
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const localDb = {
  workspaces: {
    findAll(tenantId?: string): WorkspaceRecord[] {
      const state = getState();
      const results = tenantId
        ? state.workspaces.filter((w) => w.tenantId === tenantId)
        : state.workspaces;
      logger.debug('workspaces.findAll', { tenantId, count: results.length });
      return results;
    },

    findById(id: string): WorkspaceRecord | undefined {
      const state = getState();
      return state.workspaces.find((w) => w.id === id);
    },

    findByExternalId(
      externalId: string,
      integrationType: IntegrationType
    ): WorkspaceRecord | undefined {
      const state = getState();
      return state.workspaces.find(
        (w) => w.externalId === externalId && w.integrationType === integrationType
      );
    },

    upsert(
      workspace: Omit<WorkspaceRecord, 'id' | 'updatedAt'> & { id?: string }
    ): WorkspaceRecord {
      const state = getState();
      const now = new Date().toISOString();

      const existing = workspace.id
        ? state.workspaces.find((w) => w.id === workspace.id)
        : state.workspaces.find(
            (w) =>
              w.externalId === workspace.externalId &&
              w.integrationType === workspace.integrationType
          );

      if (existing) {
        const updated: WorkspaceRecord = {
          ...existing,
          ...workspace,
          id: existing.id,
          updatedAt: now,
        };
        state.workspaces = state.workspaces.map((w) => (w.id === existing.id ? updated : w));
        setState(state);
        logger.info('Workspace updated', { id: updated.id, name: updated.name });
        return updated;
      }

      const newWorkspace: WorkspaceRecord = {
        ...workspace,
        id: workspace.id || generateId(),
        updatedAt: now,
      };
      state.workspaces.push(newWorkspace);
      setState(state);
      logger.info('Workspace created', { id: newWorkspace.id, name: newWorkspace.name });
      return newWorkspace;
    },

    delete(id: string): boolean {
      const state = getState();
      const before = state.workspaces.length;
      state.workspaces = state.workspaces.filter((w) => w.id !== id);
      const deleted = state.workspaces.length < before;
      if (deleted) {
        setState(state);
        logger.info('Workspace deleted', { id });
      }
      return deleted;
    },

    clear(): void {
      const state = getState();
      state.workspaces = [];
      setState(state);
      logger.info('All workspaces cleared');
    },
  },

  users: {
    findAll(tenantId?: string): UserRecord[] {
      const state = getState();
      return tenantId ? state.users.filter((u) => u.tenantId === tenantId) : state.users;
    },

    findById(id: string): UserRecord | undefined {
      const state = getState();
      return state.users.find((u) => u.id === id);
    },

    findByEmail(email: string, tenantId: string): UserRecord | undefined {
      const state = getState();
      return state.users.find((u) => u.email === email && u.tenantId === tenantId);
    },

    upsert(user: Omit<UserRecord, 'createdAt' | 'updatedAt'> & { createdAt?: string }): UserRecord {
      const state = getState();
      const now = new Date().toISOString();

      const existing = state.users.find((u) => u.id === user.id);

      if (existing) {
        const updated: UserRecord = { ...existing, ...user, updatedAt: now };
        state.users = state.users.map((u) => (u.id === existing.id ? updated : u));
        setState(state);
        logger.info('User updated', { id: updated.id, email: updated.email });
        return updated;
      }

      const newUser: UserRecord = {
        ...user,
        createdAt: user.createdAt || now,
        updatedAt: now,
      };
      state.users.push(newUser);
      setState(state);
      logger.info('User created', { id: newUser.id, email: newUser.email });
      return newUser;
    },

    delete(id: string): boolean {
      const state = getState();
      const before = state.users.length;
      state.users = state.users.filter((u) => u.id !== id);
      const deleted = state.users.length < before;
      if (deleted) {
        setState(state);
        logger.info('User deleted', { id });
      }
      return deleted;
    },
  },

  slackUserConnections: {
    findAll(filters?: {
      tenantId?: string;
      inkeepUserId?: string;
      slackWorkspaceId?: string;
      status?: SlackUserConnection['status'];
    }): SlackUserConnection[] {
      const state = getState();
      let results = state.slackUserConnections || [];

      if (filters?.tenantId) {
        results = results.filter((c) => c.tenantId === filters.tenantId);
      }
      if (filters?.inkeepUserId) {
        results = results.filter((c) => c.inkeepUserId === filters.inkeepUserId);
      }
      if (filters?.slackWorkspaceId) {
        results = results.filter((c) => c.slackWorkspaceId === filters.slackWorkspaceId);
      }
      if (filters?.status) {
        results = results.filter((c) => c.status === filters.status);
      }

      logger.debug('slackUserConnections.findAll', { filters, count: results.length });
      return results;
    },

    findById(id: string): SlackUserConnection | undefined {
      const state = getState();
      return (state.slackUserConnections || []).find((c) => c.id === id);
    },

    findBySlackUser(
      slackUserId: string,
      slackWorkspaceId: string
    ): SlackUserConnection | undefined {
      const state = getState();
      return (state.slackUserConnections || []).find(
        (c) =>
          c.slackUserId === slackUserId &&
          c.slackWorkspaceId === slackWorkspaceId &&
          c.status === 'active'
      );
    },

    findByInkeepUser(inkeepUserId: string): SlackUserConnection[] {
      const state = getState();
      return (state.slackUserConnections || []).filter(
        (c) => c.inkeepUserId === inkeepUserId && c.status === 'active'
      );
    },

    findByNangoConnectionId(nangoConnectionId: string): SlackUserConnection | undefined {
      const state = getState();
      return (state.slackUserConnections || []).find(
        (c) => c.nangoConnectionId === nangoConnectionId
      );
    },

    upsert(connection: Omit<SlackUserConnection, 'id'> & { id?: string }): SlackUserConnection {
      const state = getState();
      if (!state.slackUserConnections) state.slackUserConnections = [];

      const existing = connection.id
        ? state.slackUserConnections.find((c) => c.id === connection.id)
        : state.slackUserConnections.find(
            (c) => c.nangoConnectionId === connection.nangoConnectionId
          );

      if (existing) {
        const updated: SlackUserConnection = {
          ...existing,
          ...connection,
          id: existing.id,
          lastSyncAt: new Date().toISOString(),
        };
        state.slackUserConnections = state.slackUserConnections.map((c) =>
          c.id === existing.id ? updated : c
        );
        setState(state);
        logger.info('SlackUserConnection updated', {
          id: updated.id,
          slackUserId: updated.slackUserId,
          inkeepUserId: updated.inkeepUserId,
        });
        return updated;
      }

      const newConnection: SlackUserConnection = {
        ...connection,
        id: connection.id || generateId(),
        lastSyncAt: new Date().toISOString(),
      };
      state.slackUserConnections.push(newConnection);
      setState(state);
      logger.info('SlackUserConnection created', {
        id: newConnection.id,
        slackUserId: newConnection.slackUserId,
        inkeepUserId: newConnection.inkeepUserId,
        tenantId: newConnection.tenantId,
      });
      return newConnection;
    },

    updateStatus(
      id: string,
      status: SlackUserConnection['status']
    ): SlackUserConnection | undefined {
      const state = getState();
      if (!state.slackUserConnections) return undefined;

      const connection = state.slackUserConnections.find((c) => c.id === id);
      if (!connection) return undefined;

      connection.status = status;
      connection.lastSyncAt = new Date().toISOString();
      if (status === 'active') {
        connection.lastActiveAt = new Date().toISOString();
      }
      setState(state);
      logger.info('SlackUserConnection status updated', { id, status });
      return connection;
    },

    updateLastActive(id: string): SlackUserConnection | undefined {
      const state = getState();
      if (!state.slackUserConnections) return undefined;

      const connection = state.slackUserConnections.find((c) => c.id === id);
      if (!connection) return undefined;

      connection.lastActiveAt = new Date().toISOString();
      setState(state);
      logger.debug('SlackUserConnection lastActive updated', { id });
      return connection;
    },

    delete(id: string): boolean {
      const state = getState();
      if (!state.slackUserConnections) return false;

      const before = state.slackUserConnections.length;
      state.slackUserConnections = state.slackUserConnections.filter((c) => c.id !== id);
      const deleted = state.slackUserConnections.length < before;
      if (deleted) {
        setState(state);
        logger.info('SlackUserConnection deleted', { id });
      }
      return deleted;
    },

    deleteByInkeepUser(inkeepUserId: string): number {
      const state = getState();
      if (!state.slackUserConnections) return 0;

      const before = state.slackUserConnections.length;
      state.slackUserConnections = state.slackUserConnections.filter(
        (c) => c.inkeepUserId !== inkeepUserId
      );
      const count = before - state.slackUserConnections.length;
      if (count > 0) {
        setState(state);
        logger.info('SlackUserConnections deleted by Inkeep user', { inkeepUserId, count });
      }
      return count;
    },

    clear(): void {
      const state = getState();
      state.slackUserConnections = [];
      setState(state);
      logger.info('All SlackUserConnections cleared');
    },
  },

  connections: {
    findAll(filters?: {
      tenantId?: string;
      userId?: string;
      integrationType?: IntegrationType;
    }): ConnectionRecord[] {
      const state = getState();
      let results = state.connections;

      if (filters?.tenantId) {
        results = results.filter((c) => c.tenantId === filters.tenantId);
      }
      if (filters?.userId) {
        results = results.filter((c) => c.userId === filters.userId);
      }
      if (filters?.integrationType) {
        results = results.filter((c) => c.integrationType === filters.integrationType);
      }

      logger.debug('connections.findAll', { filters, count: results.length });
      return results;
    },

    findById(id: string): ConnectionRecord | undefined {
      const state = getState();
      return state.connections.find((c) => c.id === id);
    },

    findByNangoConnectionId(nangoConnectionId: string): ConnectionRecord | undefined {
      const state = getState();
      return state.connections.find((c) => c.nangoConnectionId === nangoConnectionId);
    },

    findByExternalUser(
      externalUserId: string,
      integrationType: IntegrationType
    ): ConnectionRecord | undefined {
      const state = getState();
      return state.connections.find(
        (c) =>
          c.externalUserId === externalUserId &&
          c.integrationType === integrationType &&
          c.status === 'active'
      );
    },

    upsert(connection: Omit<ConnectionRecord, 'id'> & { id?: string }): ConnectionRecord {
      const state = getState();

      const existing = connection.id
        ? state.connections.find((c) => c.id === connection.id)
        : state.connections.find((c) => c.nangoConnectionId === connection.nangoConnectionId);

      if (existing) {
        const updated: ConnectionRecord = { ...existing, ...connection, id: existing.id };
        state.connections = state.connections.map((c) => (c.id === existing.id ? updated : c));
        setState(state);
        logger.info('Connection updated', { id: updated.id, userId: updated.userId });
        return updated;
      }

      const newConnection: ConnectionRecord = {
        ...connection,
        id: connection.id || generateId(),
      };
      state.connections.push(newConnection);
      setState(state);
      logger.info('Connection created', {
        id: newConnection.id,
        userId: newConnection.userId,
        type: newConnection.integrationType,
      });
      return newConnection;
    },

    updateStatus(id: string, status: ConnectionRecord['status']): ConnectionRecord | undefined {
      const state = getState();
      const connection = state.connections.find((c) => c.id === id);
      if (!connection) return undefined;

      connection.status = status;
      if (status === 'active') {
        connection.lastActiveAt = new Date().toISOString();
      }
      setState(state);
      logger.info('Connection status updated', { id, status });
      return connection;
    },

    delete(id: string): boolean {
      const state = getState();
      const before = state.connections.length;
      state.connections = state.connections.filter((c) => c.id !== id);
      const deleted = state.connections.length < before;
      if (deleted) {
        setState(state);
        logger.info('Connection deleted', { id });
      }
      return deleted;
    },

    deleteByUserId(userId: string): number {
      const state = getState();
      const before = state.connections.length;
      state.connections = state.connections.filter((c) => c.userId !== userId);
      const count = before - state.connections.length;
      if (count > 0) {
        setState(state);
        logger.info('Connections deleted by user', { userId, count });
      }
      return count;
    },

    clear(): void {
      const state = getState();
      state.connections = [];
      setState(state);
      logger.info('All connections cleared');
    },
  },

  auditLogs: {
    findAll(filters?: {
      tenantId?: string;
      userId?: string;
      action?: string;
      limit?: number;
    }): AuditLogRecord[] {
      const state = getState();
      let results = state.auditLogs;

      if (filters?.tenantId) {
        results = results.filter((l) => l.tenantId === filters.tenantId);
      }
      if (filters?.userId) {
        results = results.filter((l) => l.userId === filters.userId);
      }
      if (filters?.action) {
        results = results.filter((l) => l.action === filters.action);
      }

      results = results.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      if (filters?.limit) {
        results = results.slice(0, filters.limit);
      }

      return results;
    },

    create(log: Omit<AuditLogRecord, 'id' | 'createdAt'>): AuditLogRecord {
      const state = getState();
      const newLog: AuditLogRecord = {
        ...log,
        id: generateId(),
        createdAt: new Date().toISOString(),
      };
      state.auditLogs.push(newLog);

      if (state.auditLogs.length > 1000) {
        state.auditLogs = state.auditLogs.slice(-500);
      }

      setState(state);
      logger.debug('Audit log created', {
        action: newLog.action,
        resourceType: newLog.resourceType,
      });
      return newLog;
    },

    clear(): void {
      const state = getState();
      state.auditLogs = [];
      setState(state);
      logger.info('All audit logs cleared');
    },
  },

  getFullState(): DatabaseState {
    return getState();
  },

  clearAll(): void {
    setState(INITIAL_DB_STATE);
    logger.info('Database cleared completely');
  },

  exportToJSON(): string {
    return JSON.stringify(getState(), null, 2);
  },

  importFromJSON(json: string): boolean {
    try {
      const data = JSON.parse(json) as DatabaseState;
      setState(data);
      logger.info('Database imported from JSON');
      return true;
    } catch (error) {
      logger.error('Failed to import database from JSON', error);
      return false;
    }
  },
};

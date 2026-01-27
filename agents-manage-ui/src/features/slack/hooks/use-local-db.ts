'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { localDb } from '../db';
import type { ConnectionRecord, IntegrationType, UserRecord, WorkspaceRecord } from '../db/schema';

const logger = {
  info: (hook: string, msg: string, data?: Record<string, unknown>) => {
    console.log(`[${hook}] ${msg}`, data ? JSON.stringify(data, null, 2) : '');
  },
  error: (hook: string, msg: string, error?: unknown) => {
    console.error(`[${hook}] ERROR: ${msg}`, error);
  },
};

export function useWorkspacesDb(tenantId: string) {
  const [workspaces, setWorkspaces] = useState<WorkspaceRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    try {
      setIsLoading(true);
      setError(null);
      const data = localDb.workspaces.findAll(tenantId);
      setWorkspaces(data);
      logger.info('useWorkspacesDb', 'Workspaces loaded', { count: data.length, tenantId });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load workspaces');
      setError(error);
      logger.error('useWorkspacesDb', 'Failed to load workspaces', err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upsertWorkspace = useCallback(
    (workspace: Parameters<typeof localDb.workspaces.upsert>[0]) => {
      try {
        const result = localDb.workspaces.upsert(workspace);
        refresh();
        logger.info('useWorkspacesDb', 'Workspace upserted', { id: result.id, name: result.name });
        return result;
      } catch (err) {
        logger.error('useWorkspacesDb', 'Failed to upsert workspace', err);
        throw err;
      }
    },
    [refresh]
  );

  const deleteWorkspace = useCallback(
    (id: string) => {
      try {
        const result = localDb.workspaces.delete(id);
        if (result) {
          refresh();
          logger.info('useWorkspacesDb', 'Workspace deleted', { id });
        }
        return result;
      } catch (err) {
        logger.error('useWorkspacesDb', 'Failed to delete workspace', err);
        throw err;
      }
    },
    [refresh]
  );

  const clearAll = useCallback(() => {
    localDb.workspaces.clear();
    refresh();
    logger.info('useWorkspacesDb', 'All workspaces cleared');
  }, [refresh]);

  const slackWorkspaces = useMemo(
    () => workspaces.filter((w) => w.integrationType === 'slack'),
    [workspaces]
  );

  const latestWorkspace = useMemo(
    () =>
      slackWorkspaces.length > 0
        ? slackWorkspaces.sort(
            (a, b) => new Date(b.installedAt).getTime() - new Date(a.installedAt).getTime()
          )[0]
        : null,
    [slackWorkspaces]
  );

  return {
    workspaces,
    slackWorkspaces,
    latestWorkspace,
    isLoading,
    error,
    refresh,
    upsertWorkspace,
    deleteWorkspace,
    clearAll,
  };
}

export function useUsersDb(tenantId: string) {
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    try {
      setIsLoading(true);
      setError(null);
      const data = localDb.users.findAll(tenantId);
      setUsers(data);
      logger.info('useUsersDb', 'Users loaded', { count: data.length, tenantId });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load users');
      setError(error);
      logger.error('useUsersDb', 'Failed to load users', err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upsertUser = useCallback(
    (user: Parameters<typeof localDb.users.upsert>[0]) => {
      try {
        const result = localDb.users.upsert(user);
        refresh();
        logger.info('useUsersDb', 'User upserted', { id: result.id, email: result.email });
        return result;
      } catch (err) {
        logger.error('useUsersDb', 'Failed to upsert user', err);
        throw err;
      }
    },
    [refresh]
  );

  const findById = useCallback((id: string) => {
    return localDb.users.findById(id);
  }, []);

  return {
    users,
    isLoading,
    error,
    refresh,
    upsertUser,
    findById,
  };
}

export function useConnectionsDb(filters?: {
  tenantId?: string;
  userId?: string;
  integrationType?: IntegrationType;
}) {
  const [connections, setConnections] = useState<ConnectionRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    try {
      setIsLoading(true);
      setError(null);
      const data = localDb.connections.findAll(filters);
      setConnections(data);
      logger.info('useConnectionsDb', 'Connections loaded', { count: data.length });
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to load connections');
      setError(error);
      logger.error('useConnectionsDb', 'Failed to load connections', err);
    } finally {
      setIsLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const upsertConnection = useCallback(
    (connection: Parameters<typeof localDb.connections.upsert>[0]) => {
      try {
        const result = localDb.connections.upsert(connection);
        refresh();
        logger.info('useConnectionsDb', 'Connection upserted', {
          id: result.id,
          userId: result.userId,
        });
        return result;
      } catch (err) {
        logger.error('useConnectionsDb', 'Failed to upsert connection', err);
        throw err;
      }
    },
    [refresh]
  );

  const deleteConnection = useCallback(
    (id: string) => {
      try {
        const result = localDb.connections.delete(id);
        if (result) {
          refresh();
          logger.info('useConnectionsDb', 'Connection deleted', { id });
        }
        return result;
      } catch (err) {
        logger.error('useConnectionsDb', 'Failed to delete connection', err);
        throw err;
      }
    },
    [refresh]
  );

  const updateStatus = useCallback(
    (id: string, status: ConnectionRecord['status']) => {
      try {
        const result = localDb.connections.updateStatus(id, status);
        if (result) {
          refresh();
          logger.info('useConnectionsDb', 'Connection status updated', { id, status });
        }
        return result;
      } catch (err) {
        logger.error('useConnectionsDb', 'Failed to update connection status', err);
        throw err;
      }
    },
    [refresh]
  );

  const clearAll = useCallback(() => {
    localDb.connections.clear();
    refresh();
    logger.info('useConnectionsDb', 'All connections cleared');
  }, [refresh]);

  const activeConnections = useMemo(
    () => connections.filter((c) => c.status === 'active'),
    [connections]
  );

  const slackConnections = useMemo(
    () => connections.filter((c) => c.integrationType === 'slack'),
    [connections]
  );

  const currentUserConnection = useMemo(
    () =>
      filters?.userId
        ? activeConnections.find(
            (c) => c.userId === filters.userId && c.integrationType === 'slack'
          )
        : null,
    [activeConnections, filters?.userId]
  );

  return {
    connections,
    activeConnections,
    slackConnections,
    currentUserConnection,
    isLoading,
    error,
    refresh,
    upsertConnection,
    deleteConnection,
    updateStatus,
    clearAll,
  };
}

export function useAuditLogsDb(tenantId: string, limit = 50) {
  const [logs, setLogs] = useState<ReturnType<typeof localDb.auditLogs.findAll>>([]);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = useCallback(() => {
    try {
      setIsLoading(true);
      const data = localDb.auditLogs.findAll({ tenantId, limit });
      setLogs(data);
      logger.info('useAuditLogsDb', 'Audit logs loaded', { count: data.length });
    } catch (err) {
      logger.error('useAuditLogsDb', 'Failed to load audit logs', err);
    } finally {
      setIsLoading(false);
    }
  }, [tenantId, limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const createLog = useCallback(
    (log: Parameters<typeof localDb.auditLogs.create>[0]) => {
      const result = localDb.auditLogs.create(log);
      refresh();
      return result;
    },
    [refresh]
  );

  return {
    logs,
    isLoading,
    refresh,
    createLog,
  };
}

export function useDatabaseState() {
  const [state, setState] = useState<ReturnType<typeof localDb.getFullState> | null>(null);

  const refresh = useCallback(() => {
    setState(localDb.getFullState());
  }, []);

  useEffect(() => {
    refresh();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'inkeep_slack_db') {
        refresh();
      }
    };

    const handleCustomRefresh = () => {
      refresh();
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('inkeep-db-update', handleCustomRefresh);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('inkeep-db-update', handleCustomRefresh);
    };
  }, [refresh]);

  const exportJSON = useCallback(() => {
    return localDb.exportToJSON();
  }, []);

  const importJSON = useCallback(
    (json: string) => {
      const success = localDb.importFromJSON(json);
      if (success) refresh();
      return success;
    },
    [refresh]
  );

  const clearAll = useCallback(() => {
    localDb.clearAll();
    refresh();
  }, [refresh]);

  return {
    state,
    refresh,
    exportJSON,
    importJSON,
    clearAll,
  };
}

'use client';

import {
  type AuditLogRecord,
  type DatabaseState,
  DB_STORAGE_KEY,
  INITIAL_DB_STATE,
  type WorkspaceRecord,
} from './schema';

function getState(): DatabaseState {
  if (typeof window === 'undefined') return INITIAL_DB_STATE;

  try {
    const stored = localStorage.getItem(DB_STORAGE_KEY);
    if (!stored) return INITIAL_DB_STATE;
    return JSON.parse(stored) as DatabaseState;
  } catch {
    return INITIAL_DB_STATE;
  }
}

function setState(state: DatabaseState): void {
  if (typeof window === 'undefined') return;

  try {
    state.lastUpdatedAt = new Date().toISOString();
    localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage errors
  }
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export const localDb = {
  workspaces: {
    findAll(tenantId?: string): WorkspaceRecord[] {
      const state = getState();
      return tenantId ? state.workspaces.filter((w) => w.tenantId === tenantId) : state.workspaces;
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
        return updated;
      }

      const newWorkspace: WorkspaceRecord = {
        ...workspace,
        id: workspace.id || generateId(),
        updatedAt: now,
      };
      state.workspaces.push(newWorkspace);
      setState(state);
      return newWorkspace;
    },

    delete(id: string): boolean {
      const state = getState();
      const before = state.workspaces.length;
      state.workspaces = state.workspaces.filter((w) => w.id !== id);
      const deleted = state.workspaces.length < before;
      if (deleted) {
        setState(state);
      }
      return deleted;
    },
  },

  auditLogs: {
    create(log: Omit<AuditLogRecord, 'id' | 'createdAt'> & { id?: string }): AuditLogRecord {
      const state = getState();
      const now = new Date().toISOString();

      const newLog: AuditLogRecord = {
        ...log,
        id: log.id || generateId(),
        createdAt: now,
      };
      state.auditLogs.push(newLog);
      setState(state);
      return newLog;
    },
  },
};

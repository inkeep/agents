// ============================================================
// src/lib/db.ts
// Database operations for Phase 1 MVP
// ============================================================

/**
 * Database client stub
 *
 * TODO: Replace with actual agents-core import once the monorepo is set up:
 * import { createAgentsManageDatabaseClient, type AgentsManageDatabaseClient }
 *   from '@inkeep/agents-core/db/manage/manage-client';
 */

import { getEnv } from './env';
import type {
  Agent,
  ChannelConfig,
  Project,
  Thread,
  ThreadData,
  User,
  UserSettings,
} from './types';

// ============================================================
// Types
// ============================================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type QueryFilter = Record<string, any>;

/**
 * Mock type for agents-core database client
 * TODO: Replace with actual type from agents-core
 */
export interface AgentsManageDatabaseClient {
  query: {
    slackWorkspaces: {
      findFirst: (filter?: QueryFilter) => Promise<unknown>;
      findMany: (filter?: QueryFilter) => Promise<unknown[]>;
    };
    slackChannels: {
      findFirst: (filter?: QueryFilter) => Promise<unknown>;
      findMany: (filter?: QueryFilter) => Promise<unknown[]>;
    };
  };
  insert: () => {
    values: (data: unknown) => {
      returning: () => Promise<unknown[]>;
    };
  };
  update: () => {
    set: (data: unknown) => {
      where: (filter: QueryFilter) => {
        returning: () => Promise<unknown[]>;
      };
    };
  };
  delete: () => {
    where: (filter: QueryFilter) => Promise<void>;
  };
}

// ============================================================
// Constants
// ============================================================

const DEFAULT_SETTINGS: UserSettings = {
  notifications: { dmOnThreadReply: true },
  language: 'en',
};

// ============================================================
// Agents Manage Database Client (Singleton)
// ============================================================

let agentsDbClient: AgentsManageDatabaseClient | null = null;

/**
 * Get the agents-core database client (for Drizzle-based operations)
 * Used for workspace/channel management via agents-core patterns
 */
export function getAgentsDb(): AgentsManageDatabaseClient {
  if (agentsDbClient) return agentsDbClient;

  const connectionString = getEnv().INKEEP_AGENTS_MANAGE_DATABASE_URL;

  if (!connectionString) {
    console.warn('⚠️  INKEEP_AGENTS_MANAGE_DATABASE_URL not set - database features disabled');
    agentsDbClient = createMockAgentsDbClient();
    return agentsDbClient;
  }

  // TODO: Replace with actual implementation once agents-core is available
  // agentsDbClient = createAgentsManageDatabaseClient({ connectionString });

  console.warn('⚠️  Agents database client not implemented - using mock');
  agentsDbClient = createMockAgentsDbClient();
  return agentsDbClient;
}

function createMockAgentsDbClient(): AgentsManageDatabaseClient {
  return {
    query: {
      slackWorkspaces: {
        findFirst: async () => null,
        findMany: async () => [],
      },
      slackChannels: {
        findFirst: async () => null,
        findMany: async () => [],
      },
    },
    insert: () => ({
      values: () => ({
        returning: async () => [],
      }),
    }),
    update: () => ({
      set: () => ({
        where: () => ({
          returning: async () => [],
        }),
      }),
    }),
    delete: () => ({
      where: async () => {},
    }),
  };
}

// ============================================================
// REST API Database Client (Legacy/MVP)
// ============================================================

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`Database request failed: ${res.status} ${res.statusText}`);
  }
  return res.json();
}

async function fetchJsonOrNull<T>(url: string, init?: RequestInit): Promise<T | null> {
  const res = await fetch(url, init);
  return res.ok ? res.json() : null;
}

/**
 * REST API database client for Phase 1 MVP
 * Used for users, projects, agents, threads, and channel config
 */
export const db = {
  // Users
  async getUser(id: string): Promise<User> {
    const dbUrl = getEnv().DB_URL;
    const user = await fetchJson<User>(`${dbUrl}/users/${id}`);
    return { ...user, settings: user.settings || DEFAULT_SETTINGS };
  },

  async loginUser(id: string): Promise<{ org?: string }> {
    const dbUrl = getEnv().DB_URL;
    return fetchJson(`${dbUrl}/users/${id}/login`, { method: 'POST' });
  },

  async logoutUser(id: string): Promise<void> {
    const dbUrl = getEnv().DB_URL;
    await fetch(`${dbUrl}/users/${id}`, { method: 'DELETE' });
  },

  async updateUserSettings(id: string, settings: Partial<UserSettings>): Promise<User> {
    const dbUrl = getEnv().DB_URL;
    return fetchJson(`${dbUrl}/users/${id}/settings`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  },

  // Projects & Agents
  async getProjects(): Promise<Project[]> {
    const dbUrl = getEnv().DB_URL;
    return fetchJson(`${dbUrl}/projects`);
  },

  async getProject(id: string): Promise<Project> {
    const dbUrl = getEnv().DB_URL;
    return fetchJson(`${dbUrl}/projects/${id}`);
  },

  async getAgents(projectId: string): Promise<Agent[]> {
    const dbUrl = getEnv().DB_URL;
    return fetchJson(`${dbUrl}/projects/${projectId}/agents`);
  },

  async getAgent(id: string, projectId?: string): Promise<Agent | null> {
    const dbUrl = getEnv().DB_URL;
    const url = projectId
      ? `${dbUrl}/agents/${id}?projectId=${projectId}`
      : `${dbUrl}/agents/${id}`;
    return fetchJsonOrNull(url);
  },

  async getProjectsWithAgents(): Promise<Array<Project & { agents: Agent[] }>> {
    const projects = await this.getProjects();
    return Promise.all(projects.map(async (p) => ({ ...p, agents: await this.getAgents(p.id) })));
  },

  // Threads
  async createThread(data: Thread): Promise<Thread> {
    const dbUrl = getEnv().DB_URL;
    return fetchJson(`${dbUrl}/threads`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  async getThread(channelId: string, threadTs: string): Promise<ThreadData | null> {
    const dbUrl = getEnv().DB_URL;
    return fetchJsonOrNull(`${dbUrl}/threads/${channelId}/${threadTs}`);
  },

  async updateThread(
    channelId: string,
    threadTs: string,
    data: Partial<Thread>
  ): Promise<Thread | null> {
    const dbUrl = getEnv().DB_URL;
    return fetchJsonOrNull(`${dbUrl}/threads/${channelId}/${threadTs}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  // Channel Config
  async getChannelConfig(channelId: string): Promise<ChannelConfig | null> {
    const dbUrl = getEnv().DB_URL;
    return fetchJsonOrNull(`${dbUrl}/channels/${channelId}/config`);
  },

  async setChannelConfig(
    channelId: string,
    data: {
      projectId: string;
      agentId: string;
      configuredBy: string;
      channelName?: string;
    }
  ): Promise<ChannelConfig> {
    const dbUrl = getEnv().DB_URL;
    return fetchJson(`${dbUrl}/channels/${channelId}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  },

  async deleteChannelConfig(channelId: string): Promise<void> {
    const dbUrl = getEnv().DB_URL;
    await fetch(`${dbUrl}/channels/${channelId}/config`, { method: 'DELETE' });
  },
};

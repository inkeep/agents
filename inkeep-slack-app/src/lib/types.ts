// ============================================================
// src/lib/types.ts
// Type definitions for Phase 1 MVP
// ============================================================

// Core entities
export interface Project {
  id: string;
  name: string;
}

export interface Agent {
  id: string;
  name: string;
  projectId?: string;
}

export interface User {
  id: string;
  isAuthenticated: boolean;
  isAdmin?: boolean;
  email?: string;
  settings: UserSettings;
}

export interface UserSettings {
  defaultProjectId?: string;
  defaultAgentId?: string;
  notifications: { dmOnThreadReply: boolean };
  language: string;
}

export const DEFAULT_USER_SETTINGS: UserSettings = {
  notifications: { dmOnThreadReply: true },
  language: 'en',
};

// Thread tracking
export interface Thread {
  threadTs: string;
  channelId: string;
  agentId: string;
  projectId: string;
  userId: string;
  conversationId?: string;
}

export interface ThreadData {
  thread: Thread;
  agent: Agent;
}

// Channel configuration
export interface ChannelConfig {
  channelId: string;
  channelName?: string;
  projectId: string;
  agentId: string;
  configuredBy: string;
  configuredAt: string;
}

// Action payloads (JSON-encoded in button values)
export interface AgentSelectPayload {
  agentId: string;
  projectId: string;
  agentName?: string;
  projectName?: string;
}

export interface AskModalMetadata {
  channelId: string;
  prefilled?: string;
  messageContext?: string;
}

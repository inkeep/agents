import type { SlackAgentOption } from '../../actions/agents';

export type { SlackAgentOption };

export interface Channel {
  id: string;
  name: string;
  isPrivate: boolean;
  isShared?: boolean;
  memberCount?: number;
  hasAgentConfig: boolean;
  agentConfig?: {
    projectId: string;
    agentId: string;
    agentName?: string;
  };
}

export interface DefaultAgentConfig {
  agentId: string;
  agentName?: string;
  projectId: string;
  projectName?: string;
}

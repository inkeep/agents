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
    grantAccessToMembers?: boolean;
  };
}

export interface DefaultAgentConfig {
  agentId: string;
  agentName?: string;
  projectId: string;
  projectName?: string;
  grantAccessToMembers?: boolean;
}

export const CHANNEL_ACCESS_OPTIONS = [
  {
    id: 'channel-members',
    label: 'Channel members',
    description: 'Slack channel membership grants access — no explicit project invite needed.',
    value: true,
  },
  {
    id: 'explicit-project-access',
    label: 'Explicit project access',
    description: 'Only users with explicit Inkeep project access can use this agent.',
    value: false,
  },
] as const;

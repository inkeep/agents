import type { SlackAgentOption } from '../../actions/agents';

export type { SlackAgentOption };

export interface DefaultAgentConfig {
  agentId: string;
  projectId: string;
  grantAccessToMembers?: boolean;
}

export interface Channel {
  id: string;
  name: string;
  isPrivate: boolean;
  isShared?: boolean;
  memberCount?: number;
  hasAgentConfig: boolean;
  agentConfig?: DefaultAgentConfig;
}

export function getAgentDisplayName(
  agents: SlackAgentOption[],
  agentId: string,
  projectId: string
): string {
  return agents.find((a) => a.id === agentId && a.projectId === projectId)?.name ?? agentId;
}

export function getProjectDisplayName(agents: SlackAgentOption[], projectId: string): string {
  return agents.find((a) => a.projectId === projectId)?.projectName ?? projectId;
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

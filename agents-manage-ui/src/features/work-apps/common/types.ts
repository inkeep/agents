'use client';

export type WorkAppId = 'slack' | 'github' | 'discord' | 'linear' | 'notion' | 'jira';

export type WorkAppStatus = 'available' | 'installed' | 'connected' | 'coming_soon';

export interface WorkApp {
  id: WorkAppId;
  name: string;
  description: string;
  icon: string;
  status: WorkAppStatus;
  installUrl?: string;
  dashboardUrl?: string;
  color: string;
  features: string[];
}

export const WORK_APPS_CONFIG: Record<
  WorkAppId,
  Omit<WorkApp, 'status' | 'installUrl' | 'dashboardUrl'>
> = {
  slack: {
    id: 'slack',
    name: 'Slack',
    description: 'Connect your Slack workspace to interact with Inkeep agents via slash commands',
    icon: 'slack',
    color: '#4A154B',
    features: [
      'Slash commands (/inkeep)',
      'User account linking',
      'Project listing',
      'Real-time status updates',
    ],
  },
  github: {
    id: 'github',
    name: 'GitHub',
    description: 'Integrate with GitHub for code search, issue tracking, and PR assistance',
    icon: 'github',
    color: '#24292F',
    features: [
      'Code search across repos',
      'Issue summarization',
      'PR review assistance',
      'Commit history analysis',
    ],
  },
  discord: {
    id: 'discord',
    name: 'Discord',
    description: 'Add Inkeep to your Discord server for community support automation',
    icon: 'discord',
    color: '#5865F2',
    features: ['Bot commands', 'Thread auto-responses', 'Community support', 'FAQ automation'],
  },
  linear: {
    id: 'linear',
    name: 'Linear',
    description: 'Connect Linear for project management and issue tracking integration',
    icon: 'linear',
    color: '#5E6AD2',
    features: ['Issue creation', 'Sprint planning', 'Status updates', 'Team sync'],
  },
  notion: {
    id: 'notion',
    name: 'Notion',
    description: 'Sync with Notion for knowledge base and documentation access',
    icon: 'notion',
    color: '#000000',
    features: ['Page search', 'Database queries', 'Content sync', 'Template automation'],
  },
  jira: {
    id: 'jira',
    name: 'Jira',
    description: 'Integrate with Jira for enterprise issue tracking and project management',
    icon: 'jira',
    color: '#0052CC',
    features: ['Issue management', 'Sprint tracking', 'Workflow automation', 'Reporting'],
  },
};

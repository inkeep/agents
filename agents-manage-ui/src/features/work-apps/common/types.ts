'use client';

import { SLACK_BRAND_COLOR } from '@/constants/theme';

export type WorkAppId = 'slack' | 'github';

export type WorkAppStatus = 'available' | 'installed' | 'connected';

export interface WorkApp {
  id: WorkAppId;
  name: string;
  description: string;
  icon: string;
  status: WorkAppStatus;
  installUrl?: string;
  dashboardUrl?: string;
  color: string;
}

export const WORK_APPS_CONFIG: Record<
  WorkAppId,
  Omit<WorkApp, 'status' | 'installUrl' | 'dashboardUrl'>
> = {
  slack: {
    id: 'slack',
    name: 'Slack',
    description: 'Connect your Slack workspace to interact with Inkeep agents via slash commands.',
    icon: 'slack',
    color: SLACK_BRAND_COLOR,
  },
  github: {
    id: 'github',
    name: 'GitHub',
    description: 'Integrate with GitHub for code search, issue tracking, and PR assistance.',
    icon: 'github',
    color: '#24292F',
  },
};

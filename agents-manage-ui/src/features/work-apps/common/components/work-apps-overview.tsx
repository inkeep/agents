'use client';

import { useRouter } from 'next/navigation';
import { PageHeader } from '@/components/layout/page-header';
import { useSlack } from '@/features/work-apps/slack';
import { WORK_APPS_CONFIG, type WorkApp, type WorkAppId } from '../types';
import { WorkAppCard } from './work-app-card';

interface WorkAppsOverviewProps {
  tenantId: string;
}

export function WorkAppsOverview({ tenantId }: WorkAppsOverviewProps) {
  const router = useRouter();
  const { installedWorkspaces, actions } = useSlack();
  const { handleInstallClick } = actions;

  const installedCount = installedWorkspaces.data.length;

  function getSlackStatus(): WorkApp['status'] {
    if (installedCount > 0) return 'installed';
    return 'available';
  }

  function handleInstall(appId: WorkAppId) {
    if (appId === 'slack') {
      handleInstallClick();
    } else if (appId === 'github') {
      router.push(`/${tenantId}/work-apps/github`);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Apps"
        description="Connect your favorite work tools to supercharge your Inkeep agents."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {Object.keys(WORK_APPS_CONFIG)
          .flatMap((id): WorkApp[] => {
            const config = WORK_APPS_CONFIG[id as WorkAppId];

            if (id === 'slack') {
              return [
                {
                  ...config,
                  status: getSlackStatus(),
                },
              ];
            }

            if (id === 'github') {
              return [
                {
                  ...config,
                  status: 'available',
                },
              ];
            }

            return [];
          })
          .toSorted((a, b) => {
            const statusOrder: Record<WorkApp['status'], number> = {
              connected: 0,
              installed: 1,
              available: 2,
            };
            return statusOrder[a.status] - statusOrder[b.status];
          })
          .map((app) => (
            <WorkAppCard
              key={app.id}
              app={app}
              tenantId={tenantId}
              onInstall={() => handleInstall(app.id)}
              workspaceCount={app.id === 'slack' ? installedCount : 0}
            />
          ))}
      </div>
    </div>
  );
}

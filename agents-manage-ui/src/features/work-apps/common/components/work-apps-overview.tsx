'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useMemo } from 'react';
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

  const getSlackStatus = useCallback((): WorkApp['status'] => {
    if (installedCount > 0) return 'installed';
    return 'available';
  }, [installedCount]);

  const workApps = useMemo<WorkApp[]>(() => {
    const apps: WorkApp[] = [];

    for (const id of Object.keys(WORK_APPS_CONFIG) as WorkAppId[]) {
      const config = WORK_APPS_CONFIG[id];

      if (id === 'slack') {
        apps.push({
          ...config,
          status: getSlackStatus(),
        });
      } else if (id === 'github') {
        apps.push({
          ...config,
          status: 'available',
        });
      }
    }

    return apps.sort((a, b) => {
      const statusOrder: Record<WorkApp['status'], number> = {
        connected: 0,
        installed: 1,
        available: 2,
      };
      return statusOrder[a.status] - statusOrder[b.status];
    });
  }, [getSlackStatus]);

  const handleInstall = useCallback(
    (appId: WorkAppId) => {
      if (appId === 'slack') {
        handleInstallClick();
      } else if (appId === 'github') {
        router.push(`/${tenantId}/work-apps/github`);
      }
    },
    [handleInstallClick, router, tenantId]
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Apps"
        description="Connect your favorite work tools to supercharge your Inkeep agents."
      />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {workApps.map((app) => (
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

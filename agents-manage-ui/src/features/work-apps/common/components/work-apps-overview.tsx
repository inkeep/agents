'use client';

import { Plug } from 'lucide-react';
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

  const stats = useMemo(() => {
    const connected = workApps.filter((a) => a.status === 'connected').length;
    const installed = workApps.filter((a) => a.status === 'installed').length;
    const available = workApps.filter((a) => a.status === 'available').length;
    return { connected, installed, available, total: workApps.length };
  }, [workApps]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Apps"
        description="Connect your favorite work tools to supercharge your Inkeep agents"
      />

      <div className="grid grid-cols-3 gap-4">
        <div className="bg-card rounded-lg p-4 border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Plug className="h-4 w-4" />
            <span className="text-sm">Connected</span>
          </div>
          <p className="text-2xl font-bold text-green-600">{stats.connected}</p>
        </div>
        <div className="bg-card rounded-lg p-4 border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Plug className="h-4 w-4" />
            <span className="text-sm">Installed</span>
          </div>
          <p className="text-2xl font-bold text-blue-600">{stats.installed}</p>
        </div>
        <div className="bg-card rounded-lg p-4 border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Plug className="h-4 w-4" />
            <span className="text-sm">Available</span>
          </div>
          <p className="text-2xl font-bold">{stats.available}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

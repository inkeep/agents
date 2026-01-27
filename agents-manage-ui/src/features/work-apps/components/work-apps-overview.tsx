'use client';

import { Plug } from 'lucide-react';
import { useCallback, useMemo } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { useSlack } from '@/features/slack';
import { WORK_APPS_CONFIG, type WorkApp, type WorkAppId } from '../types';
import { WorkAppCard } from './work-app-card';

interface WorkAppsOverviewProps {
  tenantId: string;
}

export function WorkAppsOverview({ tenantId }: WorkAppsOverviewProps) {
  const { workspaces, currentUserLink, actions } = useSlack();
  const { handleInstallClick } = actions;

  const getSlackStatus = useCallback((): WorkApp['status'] => {
    if (currentUserLink) return 'connected';
    if (workspaces.length > 0) return 'installed';
    return 'available';
  }, [currentUserLink, workspaces.length]);

  const workApps = useMemo<WorkApp[]>(() => {
    const apps: WorkApp[] = [];

    for (const id of Object.keys(WORK_APPS_CONFIG) as WorkAppId[]) {
      const config = WORK_APPS_CONFIG[id];

      if (id === 'slack') {
        apps.push({
          ...config,
          status: getSlackStatus(),
          dashboardUrl: workspaces[0]?.teamDomain
            ? `https://${workspaces[0].teamDomain}.slack.com`
            : undefined,
        });
      } else {
        apps.push({
          ...config,
          status: 'coming_soon',
        });
      }
    }

    return apps.sort((a, b) => {
      const statusOrder: Record<WorkApp['status'], number> = {
        connected: 0,
        installed: 1,
        available: 2,
        coming_soon: 3,
      };
      return statusOrder[a.status] - statusOrder[b.status];
    });
  }, [getSlackStatus, workspaces]);

  const handleInstall = useCallback(
    (appId: WorkAppId) => {
      if (appId === 'slack') {
        handleInstallClick();
      }
    },
    [handleInstallClick]
  );

  const stats = useMemo(() => {
    const connected = workApps.filter((a) => a.status === 'connected').length;
    const installed = workApps.filter((a) => a.status === 'installed').length;
    const available = workApps.filter((a) => a.status === 'available').length;
    const comingSoon = workApps.filter((a) => a.status === 'coming_soon').length;
    return { connected, installed, available, comingSoon, total: workApps.length };
  }, [workApps]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Work Apps"
        description="Connect your favorite work tools to supercharge your Inkeep agents"
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
        <div className="bg-card rounded-lg p-4 border">
          <div className="flex items-center gap-2 text-muted-foreground mb-1">
            <Plug className="h-4 w-4" />
            <span className="text-sm">Coming Soon</span>
          </div>
          <p className="text-2xl font-bold text-muted-foreground">{stats.comingSoon}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {workApps.map((app) => (
          <WorkAppCard
            key={app.id}
            app={app}
            tenantId={tenantId}
            onInstall={() => handleInstall(app.id)}
          />
        ))}
      </div>
    </div>
  );
}

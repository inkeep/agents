'use client';

import { ArrowLeft, FlaskConical, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useSlack } from '../context/slack-provider';
import { localDb } from '../db';
import { AccountInfoCard } from './account-info-card';
import { ConfigurationCard } from './configuration-card';
import { DatabasePreviewCard } from './database-preview-card';
import { DefaultAgentCard } from './default-agent-card';
import { InstalledWorkspacesCard } from './installed-workspaces-card';
import { LinkedUsersCard } from './linked-users-card';
import { NotificationBanner } from './notification-banner';

export function SlackDashboard() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { user, installedWorkspaces, actions } = useSlack();
  const { handleInstallClick, addOrUpdateWorkspace, setNotification } = actions;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const workspaceData = urlParams.get('workspace');
    const error = urlParams.get('error');

    if (error) {
      console.error('Slack OAuth Error:', error);
      setNotification({
        type: 'error',
        message: `Slack installation failed: ${error}`,
        action: 'error',
      });
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (success === 'true' && workspaceData) {
      try {
        const workspace = JSON.parse(workspaceData);
        console.log('=== SLACK WORKSPACE DATA RECEIVED ===');
        console.log(JSON.stringify(workspace, null, 2));
        console.log('=====================================');

        addOrUpdateWorkspace(workspace);

        const tenantId = 'default';
        localDb.workspaces.upsert({
          tenantId,
          integrationType: 'slack',
          externalId: workspace.teamId,
          enterpriseId: workspace.enterpriseId,
          enterpriseName: workspace.enterpriseName,
          name: workspace.teamName,
          domain: workspace.teamDomain,
          isEnterpriseInstall: workspace.isEnterpriseInstall || false,
          botUserId: workspace.botUserId,
          botScopes: workspace.botScopes,
          installedByUserId: user?.id || 'unknown',
          installedByUserEmail: user?.email,
          installedByExternalUserId: workspace.installerUserId,
          installedAt: workspace.installedAt || new Date().toISOString(),
          connectionId: workspace.connectionId,
          metadata: { raw: workspace },
        });

        localDb.auditLogs.create({
          tenantId,
          userId: user?.id,
          action: 'workspace.install',
          resourceType: 'workspace',
          resourceId: workspace.teamId,
          integrationType: 'slack',
          details: {
            teamName: workspace.teamName,
            enterpriseId: workspace.enterpriseId,
            connectionId: workspace.connectionId,
          },
        });

        console.log('[SlackDashboard] Workspace saved to database');

        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('inkeep-db-update'));
        }

        setNotification({
          type: 'success',
          message: `Workspace "${workspace.teamName}" installed successfully!`,
          action: 'installed',
        });

        installedWorkspaces.refetch();
      } catch (e) {
        console.error('Failed to parse workspace data:', e);
        setNotification({
          type: 'error',
          message: 'Failed to process workspace data',
          action: 'error',
        });
      }

      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [addOrUpdateWorkspace, setNotification, user, installedWorkspaces]);

  const hasInstalledWorkspaces =
    installedWorkspaces.data.length > 0 || !installedWorkspaces.isLoading;

  return (
    <>
      <div className="mb-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/${tenantId}/work-apps`}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Work Apps
          </Link>
        </Button>
      </div>

      <PageHeader
        title={
          <span className="flex items-center gap-2">
            Slack
            <Badge variant="secondary" className="text-xs font-normal gap-1">
              <FlaskConical className="h-3 w-3" />
              Beta
            </Badge>
          </span>
        }
        description="Install Inkeep Agents to your Slack workspace. This is a preview of our Slack integration — features and UI may change."
        action={
          <Button size="lg" className="gap-2" onClick={handleInstallClick}>
            <MessageSquare className="h-4 w-4" />
            Install to Slack
          </Button>
        }
      />

      <NotificationBanner />

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        <AccountInfoCard />
        <ConfigurationCard />
      </div>

      {hasInstalledWorkspaces && (
        <>
          <div className="grid gap-4 grid-cols-1 md:grid-cols-2 mt-4">
            <DefaultAgentCard />
          </div>

          <InstalledWorkspacesCard />
          <LinkedUsersCard />
        </>
      )}

      <DatabasePreviewCard />
    </>
  );
}

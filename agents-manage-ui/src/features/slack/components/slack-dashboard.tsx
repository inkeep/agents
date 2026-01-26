'use client';

import { MessageSquare } from 'lucide-react';
import { useEffect } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { STATIC_LABELS } from '@/constants/theme';
import { useSlack } from '../context/slack-context';
import { localDb } from '../db';
import { AccountInfoCard } from './account-info-card';
import { ConfigurationCard } from './configuration-card';
import { ConnectedUsersCard } from './connected-users-card';
import { ConnectionStatusCard } from './connection-status-card';
import { DatabasePreviewCard } from './database-preview-card';
import { InstalledWorkspacesCard } from './installed-workspaces-card';
import { NotificationBanner } from './notification-banner';
import { SlackAccountLinkCard } from './slack-account-link-card';
import { SlackWorkspaceInfoCard } from './slack-workspace-info-card';

export function SlackDashboard() {
  const { handleInstallClick, addOrUpdateWorkspace, setNotification, user } = useSlack();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const workspaceData = urlParams.get('workspace');
    const error = urlParams.get('error');

    if (error) {
      console.error('Slack OAuth Error:', error);
      setNotification({ type: 'error', message: `Slack installation failed: ${error}` });
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
          botToken: workspace.botToken,
          botScopes: workspace.botScopes,
          installedByUserId: user?.id || 'unknown',
          installedByUserEmail: user?.email,
          installedByExternalUserId: workspace.installerUserId,
          installedAt: workspace.installedAt || new Date().toISOString(),
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
          },
        });

        console.log('[SlackDashboard] Workspace saved to new database');

        setNotification({
          type: 'success',
          message: `Workspace "${workspace.teamName}" installed successfully!`,
        });
      } catch (e) {
        console.error('Failed to parse workspace data:', e);
        setNotification({ type: 'error', message: 'Failed to process workspace data' });
      }

      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [addOrUpdateWorkspace, setNotification, user]);

  return (
    <>
      <PageHeader
        title={STATIC_LABELS['slack-app']}
        description="Connect your Slack workspace to Inkeep Agents"
        action={
          <Button size="lg" className="gap-2" onClick={handleInstallClick}>
            <MessageSquare className="h-4 w-4" />
            Install to Slack
          </Button>
        }
      />

      <NotificationBanner />

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
        <AccountInfoCard />
        <SlackAccountLinkCard />
        <ConnectionStatusCard />
        <ConfigurationCard />
      </div>

      <SlackWorkspaceInfoCard />
      <InstalledWorkspacesCard />
      <ConnectedUsersCard />
      <DatabasePreviewCard />
    </>
  );
}

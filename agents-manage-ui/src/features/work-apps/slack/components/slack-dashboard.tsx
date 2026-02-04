'use client';

import { ArrowLeft, FlaskConical, HelpCircle, MessageSquare } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useSlack } from '../context/slack-provider';
import { localDb } from '../db';
import { AgentConfigurationCard } from './agent-configuration-card';
import { LinkedUsersSection } from './linked-users-section';
import { NotificationBanner } from './notification-banner';
import { WorkspaceHero } from './workspace-hero';

export function SlackDashboard() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { user, installedWorkspaces, actions } = useSlack();
  const { handleInstallClick, addOrUpdateWorkspace, setNotification } = actions;

  const hasWorkspace = installedWorkspaces.data.length > 0;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const urlParams = new URLSearchParams(window.location.search);
    const success = urlParams.get('success');
    const workspaceData = urlParams.get('workspace');
    const error = urlParams.get('error');

    if (error) {
      if (error === 'access_denied') {
        setNotification({
          type: 'info',
          message: 'Slack installation was cancelled.',
          action: 'cancelled',
        });
      } else {
        console.error('Slack OAuth Error:', error);
        setNotification({
          type: 'error',
          message: `Slack installation failed: ${error}`,
          action: 'error',
        });
      }
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (success === 'true' && workspaceData) {
      try {
        const workspace = JSON.parse(workspaceData);

        addOrUpdateWorkspace(workspace);

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
  }, [addOrUpdateWorkspace, setNotification, user, installedWorkspaces, tenantId]);

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" asChild className="-ml-2">
            <Link href={`/${tenantId}/work-apps`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Work Apps
            </Link>
          </Button>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                <a
                  href="https://docs.inkeep.com/integrations/slack"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <HelpCircle className="h-4 w-4" />
                </a>
              </Button>
            </TooltipTrigger>
            <TooltipContent>View documentation</TooltipContent>
          </Tooltip>
        </div>

        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold flex items-center gap-2">
              <MessageSquare className="h-6 w-6" />
              Slack Integration
              <Badge variant="secondary" className="text-xs font-normal gap-1 ml-1">
                <FlaskConical className="h-3 w-3" />
                Beta
              </Badge>
            </h1>
            <p className="text-muted-foreground mt-1">
              Connect your Slack workspace to enable AI-powered responses
            </p>
          </div>
          {hasWorkspace && (
            <Button className="gap-2" onClick={handleInstallClick}>
              <MessageSquare className="h-4 w-4" />
              Add Workspace
            </Button>
          )}
        </div>

        <NotificationBanner />

        {/* Workspace Status */}
        <WorkspaceHero />

        {/* Main Content - Only show when workspace is connected */}
        {hasWorkspace && (
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Agent Configuration - Takes 2 columns */}
            <div className="lg:col-span-2">
              <AgentConfigurationCard />
            </div>

            {/* Sidebar - Linked Users */}
            <div className="space-y-6">
              <LinkedUsersSection />

              {/* Quick Tips Card */}
              <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                <h3 className="text-sm font-medium">Quick Tips</h3>
                <ul className="text-xs text-muted-foreground space-y-2">
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    <span>
                      Users run <code className="bg-muted px-1 rounded">/inkeep link</code> to
                      connect their accounts
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    <span>
                      @mention the bot or use <code className="bg-muted px-1 rounded">/inkeep</code>{' '}
                      to ask questions
                    </span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-primary">•</span>
                    <span>Channel overrides let you use different agents per channel</span>
                  </li>
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

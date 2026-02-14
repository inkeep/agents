'use client';

import { SlackIcon } from 'lucide-react';
import { useEffect } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { DOCS_BASE_URL } from '@/constants/theme';
import { useIsOrgAdmin } from '@/hooks/use-is-org-admin';
import { useSlack } from '../context/slack-provider';
import { AgentConfigurationCard } from './agent-configuration-card';
import { LinkedUsersSection } from './linked-users-section';
import { MyLinkStatus } from './my-link-status';
import { NotificationBanner } from './notification-banner';
import { WorkspaceHero } from './workspace-hero';

export function SlackDashboard() {
  const { user, installedWorkspaces, actions } = useSlack();
  const { handleInstallClick, setNotification } = actions;
  const { isAdmin, isLoading: isLoadingRole } = useIsOrgAdmin();

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
  }, [setNotification, installedWorkspaces]);

  return (
    <TooltipProvider>
      <div className="space-y-6 h-full flex flex-col">
        {/* Header */}
        <PageHeader
          title={
            <div className="flex items-center gap-2">
              Slack Integration
              {!isLoadingRole && (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Badge variant={isAdmin ? 'primary' : 'code'} className="uppercase">
                      {isAdmin ? 'Admin' : 'Member'}
                    </Badge>
                  </TooltipTrigger>
                  <TooltipContent>
                    {isAdmin
                      ? 'You can manage workspace settings and all channel configurations'
                      : 'You can configure channels you are a member of'}
                  </TooltipContent>
                </Tooltip>
              )}
            </div>
          }
          description={
            <>
              {isAdmin
                ? 'Manage workspace settings, channel configurations, and linked users.'
                : 'Configure AI agents for your Slack channels.'}
              <ExternalLink href={`${DOCS_BASE_URL}/talk-to-your-agents/slack/overview`}>
                Learn more
              </ExternalLink>
            </>
          }
          action={
            hasWorkspace &&
            isAdmin && (
              <Button className="gap-2" onClick={handleInstallClick}>
                <SlackIcon className="h-4 w-4" />
                Add Workspace
              </Button>
            )
          }
        />

        <NotificationBanner />

        {/* Workspace Status */}
        <WorkspaceHero />

        {/* Main Content - Only show when workspace is connected */}
        {hasWorkspace && (
          <>
            {isLoadingRole ? (
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="lg:col-span-2">
                  <Skeleton className="h-[400px] w-full rounded-lg" />
                </div>
                <div className="space-y-6">
                  <Skeleton className="h-[200px] w-full rounded-lg" />
                  <Skeleton className="h-[150px] w-full rounded-lg" />
                </div>
              </div>
            ) : isAdmin ? (
              /* Admin Dashboard View */
              <div className="grid gap-6">
                {/* Agent Configuration  */}
                <AgentConfigurationCard />
                <LinkedUsersSection />
              </div>
            ) : (
              /* Member Dashboard View */
              <div className="grid gap-6 ">
                {/* Agent Configuration */}
                <AgentConfigurationCard />
                {/* Sidebar - Member Tools */}
                <MyLinkStatus currentUserId={user?.id} />
              </div>
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

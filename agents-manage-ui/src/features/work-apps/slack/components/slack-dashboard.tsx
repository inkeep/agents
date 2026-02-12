'use client';

import { ArrowLeft, HelpCircle, MessageSquare, Shield, User } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useIsOrgAdmin } from '@/hooks/use-is-org-admin';
import { useSlack } from '../context/slack-provider';
import { AgentConfigurationCard } from './agent-configuration-card';
import { LinkedUsersSection } from './linked-users-section';
import { MyLinkStatus } from './my-link-status';
import { WorkspaceHero } from './workspace-hero';

export function SlackDashboard() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { user, installedWorkspaces, actions } = useSlack();
  const { handleInstallClick } = actions;
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
        toast.info('Slack installation was cancelled.');
      } else {
        console.error('Slack OAuth Error:', error);
        toast.error(`Slack installation failed: ${error}`, { duration: Infinity });
      }
      window.history.replaceState({}, '', window.location.pathname);
      return;
    }

    if (success === 'true' && workspaceData) {
      try {
        const workspace = JSON.parse(workspaceData);

        toast.success(`Workspace "${workspace.teamName}" installed successfully!`);

        installedWorkspaces.refetch();
      } catch (e) {
        console.error('Failed to parse workspace data:', e);
        toast.error('Failed to process workspace data', { duration: Infinity });
      }

      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [installedWorkspaces]);

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
                  href="https://docs.inkeep.com/talk-to-your-agents/slack/overview"
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="View Slack integration documentation"
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
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold flex items-center gap-2">
                <MessageSquare className="h-6 w-6" />
                Slack Integration
              </h1>
              {!isLoadingRole && (
                <Tooltip>
                  <TooltipTrigger>
                    <Badge
                      variant="outline"
                      className={
                        isAdmin
                          ? 'border-primary/50 text-primary bg-primary/5'
                          : 'border-muted-foreground/30'
                      }
                    >
                      {isAdmin ? (
                        <>
                          <Shield className="h-3 w-3 mr-1" />
                          Admin
                        </>
                      ) : (
                        <>
                          <User className="h-3 w-3 mr-1" />
                          Member
                        </>
                      )}
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
            <p className="text-muted-foreground mt-1">
              {isAdmin
                ? 'Manage workspace settings, channel configurations, and linked users'
                : 'Configure AI agents for your Slack channels'}
            </p>
          </div>
          {hasWorkspace && isAdmin && (
            <Button className="gap-2" onClick={handleInstallClick}>
              <MessageSquare className="h-4 w-4" />
              Add Workspace
            </Button>
          )}
        </div>

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
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Agent Configuration - Takes 2 columns */}
                <div className="lg:col-span-2">
                  <AgentConfigurationCard />
                </div>

                {/* Sidebar - Admin Tools */}
                <div className="space-y-6">
                  <LinkedUsersSection />

                  {/* Admin Quick Tips */}
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <h3 className="text-sm font-medium">Admin Tips</h3>
                    <ul className="text-xs text-muted-foreground space-y-2">
                      <li className="flex gap-2">
                        <span className="text-primary">•</span>
                        <span>
                          Set a <strong>workspace default</strong> agent for all channels
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary">•</span>
                        <span>
                          Use <strong>channel defaults</strong> to set a specific agent per channel
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary">•</span>
                        <span>Members can configure channels they&apos;re in</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary">•</span>
                        <span>Export linked users for auditing or reporting</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            ) : (
              /* Member Dashboard View */
              <div className="grid gap-6 lg:grid-cols-3">
                {/* Agent Configuration - Takes 2 columns */}
                <div className="lg:col-span-2 space-y-6">
                  <AgentConfigurationCard />
                </div>

                {/* Sidebar - Member Tools */}
                <div className="space-y-6">
                  <MyLinkStatus currentUserId={user?.id} />

                  {/* Member Quick Tips */}
                  <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
                    <h3 className="text-sm font-medium">Getting Started</h3>
                    <ul className="text-xs text-muted-foreground space-y-2">
                      <li className="flex gap-2">
                        <span className="text-primary">•</span>
                        <span>
                          Run <code className="bg-muted px-1 rounded">/inkeep link</code> in Slack
                          to connect your account
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary">•</span>
                        <span>
                          @mention the bot or use{' '}
                          <code className="bg-muted px-1 rounded">/inkeep</code> to ask questions
                        </span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary">•</span>
                        <span>Configure agents for channels you&apos;re a member of</span>
                      </li>
                      <li className="flex gap-2">
                        <span className="text-primary">•</span>
                        <span>The workspace default is set by your admin</span>
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </TooltipProvider>
  );
}

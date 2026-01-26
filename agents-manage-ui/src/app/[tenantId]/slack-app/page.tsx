'use client';

import { MessageSquare, Settings, User, Zap } from 'lucide-react';
import { use } from 'react';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { STATIC_LABELS } from '@/constants/theme';
import { useAuthSession } from '@/hooks/use-auth';

function SlackAppPage({ params }: PageProps<'/[tenantId]/slack-app'>) {
  const { tenantId } = use(params);
  const { user, isLoading } = useAuthSession();

  return (
    <>
      <PageHeader
        title={STATIC_LABELS['slack-app']}
        description="Connect your Slack workspace to Inkeep Agents"
        action={
          <Button size="lg" className="gap-2">
            <MessageSquare className="h-4 w-4" />
            Install to Slack
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-4 w-4" />
              Account Info
            </CardTitle>
            <CardDescription>Your connected account details</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {isLoading ? (
              <div className="animate-pulse space-y-2">
                <div className="h-4 bg-muted rounded w-3/4" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </div>
            ) : user ? (
              <>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Name</span>
                  <span className="text-sm font-medium">{user.name || 'Not set'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Email</span>
                  <span className="text-sm font-medium">{user.email || 'Not set'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Tenant</span>
                  <span className="text-sm font-medium font-mono">{tenantId}</span>
                </div>
              </>
            ) : (
              <p className="text-muted-foreground text-sm">Not authenticated</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Zap className="h-4 w-4" />
              Connection Status
            </CardTitle>
            <CardDescription>Slack workspace connection</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Status</span>
              <span className="inline-flex items-center gap-1.5 text-sm">
                <span className="h-2 w-2 rounded-full bg-yellow-500" />
                Not Connected
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Workspace</span>
              <span className="text-sm text-muted-foreground">—</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Connected via</span>
              <span className="text-sm text-muted-foreground">Nango</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Configuration
            </CardTitle>
            <CardDescription>App settings and permissions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Bot Token</span>
              <span className="text-sm text-muted-foreground">Not configured</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Signing Secret</span>
              <span className="text-sm text-muted-foreground">Not configured</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Channels</span>
              <span className="text-sm text-muted-foreground">0 active</span>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}

export default SlackAppPage;

'use client';

import { Zap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSlack } from '../context/slack-provider';

export function ConnectionStatusCard() {
  const { workspaces, latestWorkspace, currentUserLink, connectionStatus } = useSlack();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const hasWorkspace = workspaces.length > 0;
  const isLinked = currentUserLink?.isLinked || connectionStatus.isConnected;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Connection Status
        </CardTitle>
        <CardDescription>Slack workspace connection</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!mounted ? (
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">Workspace</span>
              <Badge variant={hasWorkspace ? 'default' : 'secondary'}>
                {hasWorkspace ? 'Installed' : 'Not Installed'}
              </Badge>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-muted-foreground text-sm">User Link</span>
              <Badge variant={isLinked ? 'default' : 'secondary'}>
                {isLinked ? 'Linked' : 'Not Linked'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Workspaces</span>
              <span className="text-sm font-medium">{workspaces.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Latest Workspace</span>
              <span className="text-sm font-medium">{latestWorkspace?.teamName || '—'}</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

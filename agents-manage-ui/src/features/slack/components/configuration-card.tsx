'use client';

import { Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSlack } from '../context/slack-context';

export function ConfigurationCard() {
  const { latestWorkspace, mounted } = useSlack();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Settings className="h-4 w-4" />
          Configuration
        </CardTitle>
        <CardDescription>App settings and permissions</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!mounted ? (
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        ) : (
          <>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Bot Scopes</span>
              <span
                className="text-sm text-muted-foreground truncate max-w-[150px]"
                title={latestWorkspace?.botScopes}
              >
                {latestWorkspace?.botScopes ? 'Configured' : 'Not configured'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Bot User ID</span>
              <span className="text-sm font-mono text-muted-foreground">
                {latestWorkspace?.botUserId || '—'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Storage</span>
              <Badge variant="secondary">localStorage</Badge>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

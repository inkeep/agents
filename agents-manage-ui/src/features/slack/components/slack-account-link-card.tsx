'use client';

import { AlertCircle, CheckCircle2, LinkIcon, Unlink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSlack } from '../context/slack-context';

export function SlackAccountLinkCard() {
  const {
    user,
    currentUserLink,
    isConnecting,
    mounted,
    workspaces,
    connectSlack,
    disconnectSlack,
    handleInstallClick,
  } = useSlack();

  const isWorkspaceInstalled = workspaces.length > 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <LinkIcon className="h-4 w-4" />
          Slack Account Link
        </CardTitle>
        <CardDescription>Connect your personal Slack account</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {!mounted ? (
          <div className="animate-pulse space-y-2">
            <div className="h-4 bg-muted rounded w-3/4" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </div>
        ) : !user ? (
          <p className="text-muted-foreground text-sm">Log in to connect your Slack account</p>
        ) : !isWorkspaceInstalled ? (
          <>
            <div className="flex items-center gap-2 text-amber-600">
              <AlertCircle className="h-4 w-4" />
              <span className="text-sm font-medium">Workspace Required</span>
            </div>
            <p className="text-muted-foreground text-sm">
              Install the Slack app to a workspace first before linking your account.
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full gap-2"
              onClick={handleInstallClick}
            >
              Install to Slack First
            </Button>
          </>
        ) : currentUserLink?.isLinked ? (
          <>
            <div className="flex items-center gap-2 text-green-600">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">Connected</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground text-sm">Linked At</span>
              <span className="text-sm">
                {currentUserLink.linkedAt
                  ? new Date(currentUserLink.linkedAt).toLocaleDateString()
                  : '—'}
              </span>
            </div>
            <Button variant="outline" size="sm" className="w-full gap-2" onClick={disconnectSlack}>
              <Unlink className="h-4 w-4" />
              Disconnect
            </Button>
          </>
        ) : (
          <>
            <div className="flex items-center gap-2 text-blue-600">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-sm font-medium">Workspace Installed</span>
            </div>
            <p className="text-muted-foreground text-sm">
              Link your Inkeep account to use Slack commands.
            </p>
            <Button
              variant="default"
              size="sm"
              className="w-full gap-2"
              onClick={connectSlack}
              disabled={isConnecting}
            >
              <LinkIcon className="h-4 w-4" />
              {isConnecting ? 'Connecting...' : 'Connect Slack Account'}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

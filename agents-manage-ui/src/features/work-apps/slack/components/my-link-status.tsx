'use client';

import { CheckCircle2, ExternalLink, Link2, Loader2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSlackLinkedUsersQuery } from '../api/queries';
import { useSlack } from '../context/slack-provider';
import { getSlackProfileUrl } from '../utils/slack-urls';

interface MyLinkStatusProps {
  currentUserId?: string;
}

export function MyLinkStatus({ currentUserId }: MyLinkStatusProps) {
  const { installedWorkspaces } = useSlack();
  const selectedWorkspace = installedWorkspaces.data[0];

  const { data: linkedUsersData, isLoading } = useSlackLinkedUsersQuery(selectedWorkspace?.teamId);
  const linkedUsers = linkedUsersData?.linkedUsers ?? [];

  const myLink = currentUserId ? linkedUsers.find((u) => u.userId === currentUserId) : null;

  if (!selectedWorkspace) {
    return null;
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="h-4 w-4" />
          Your Account Link
        </CardTitle>
        <CardDescription className="text-xs">
          Connect your Slack and Inkeep accounts
        </CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : myLink ? (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-green-500/5 border border-green-500/20">
            <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium">Account Linked</p>
                <Badge variant="success">Active</Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Linked as{' '}
                <span className="font-medium">{myLink.slackUsername || myLink.slackEmail}</span>
                {myLink.linkedAt && <> on {formatDate(myLink.linkedAt)}</>}
                {myLink.slackUserId && (
                  <>
                    {' \u00b7 '}
                    <a
                      href={getSlackProfileUrl(myLink.slackUserId, selectedWorkspace?.teamDomain)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-primary hover:underline"
                    >
                      View in Slack
                      <ExternalLink className="h-3 w-3" />
                    </a>
                  </>
                )}
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 border">
            <XCircle className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
            <div className="flex-1">
              <p className="text-sm font-medium">Not Linked</p>
              <p className="text-xs text-muted-foreground mt-1">
                Run{' '}
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs font-mono">
                  /inkeep link
                </code>{' '}
                in Slack to connect your accounts.
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                Linking enables personalized responses and lets you configure channel settings.
              </p>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

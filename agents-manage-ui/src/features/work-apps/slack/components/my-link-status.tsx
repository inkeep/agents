'use client';

import { Link2, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink } from '@/components/ui/external-link';
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
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-muted-foreground" />
            <span className="text-base font-medium"> Your Account Link</span>
          </CardTitle>
          {!isLoading && myLink && <Badge variant="success">Active</Badge>}
          {!isLoading && !myLink && (
            <Badge className="uppercase" variant="code">
              Inactive
            </Badge>
          )}
        </div>
        <CardDescription>Connect your Slack and Inkeep accounts</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : myLink ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-40" />
                <span className="inline-flex h-2 w-2 rounded-full bg-emerald-500" />
              </span>
              <p className="text-sm text-muted-foreground">
                {'Connected as '}
                <span className="text-foreground font-medium">
                  {myLink.slackUsername || myLink.slackEmail}
                </span>{' '}
                on {formatDate(myLink.linkedAt)}
              </p>
            </div>

            <ExternalLink
              href={getSlackProfileUrl(myLink.slackUserId, selectedWorkspace?.teamDomain)}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs"
            >
              View in Slack
            </ExternalLink>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-2 w-2 rounded-full bg-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">Not connected</p>
            </div>
            <p className="text-sm leading-relaxed text-muted-foreground">
              {'Run '}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs text-foreground">
                /inkeep link
              </code>
              {
                ' in Slack to connect your accounts. Linking enables personalized responses and lets you configure channel settings.'
              }
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import { ExternalLink, Hash, RefreshCw, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useSlack } from '../context/slack-context';

export function SlackWorkspaceInfoCard() {
  const { currentUserLink, slackInfo, isLoadingSlackInfo, fetchSlackInfo } = useSlack();

  if (!currentUserLink?.isLinked) {
    return null;
  }

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Hash className="h-5 w-5" />
              Slack Workspace Info
            </CardTitle>
            <CardDescription>
              Live data from your connected Slack workspace via Nango
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchSlackInfo()}
            disabled={isLoadingSlackInfo}
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoadingSlackInfo ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isLoadingSlackInfo ? (
          <div className="animate-pulse space-y-4">
            <div className="h-4 bg-muted rounded w-1/2" />
            <div className="h-4 bg-muted rounded w-3/4" />
          </div>
        ) : slackInfo ? (
          <div className="space-y-6">
            {slackInfo.team && (
              <div className="flex items-center gap-4 p-4 bg-muted/50 rounded-lg">
                {slackInfo.team.icon && (
                  /* biome-ignore lint: External Slack image URL */
                  <img
                    src={slackInfo.team.icon}
                    alt={slackInfo.team.name}
                    className="h-12 w-12 rounded-lg"
                  />
                )}
                <div>
                  <h3 className="font-semibold">{slackInfo.team.name}</h3>
                  <p className="text-sm text-muted-foreground">{slackInfo.team.domain}.slack.com</p>
                </div>
                {slackInfo.team.url && (
                  <Button variant="outline" size="sm" className="ml-auto" asChild>
                    <a href={slackInfo.team.url} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-4 w-4 mr-1" />
                      Open Slack
                    </a>
                  </Button>
                )}
              </div>
            )}

            <div>
              <h4 className="font-medium mb-3 flex items-center gap-2">
                <Hash className="h-4 w-4" />
                Channels ({slackInfo.channels.length})
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                {slackInfo.channels.slice(0, 12).map((channel) => (
                  <div
                    key={channel.id}
                    className="flex items-center justify-between p-2 bg-muted/30 rounded-md"
                  >
                    <span className="flex items-center gap-1 text-sm">
                      <Hash className="h-3 w-3 text-muted-foreground" />
                      {channel.name}
                    </span>
                    <div className="flex items-center gap-2">
                      {channel.memberCount && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {channel.memberCount}
                        </span>
                      )}
                      {channel.isBotMember && (
                        <Badge variant="secondary" className="text-xs">
                          Bot
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              {slackInfo.channels.length > 12 && (
                <p className="text-sm text-muted-foreground mt-2">
                  ...and {slackInfo.channels.length - 12} more channels
                </p>
              )}
            </div>
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">
            Click refresh to load workspace info from Slack
          </p>
        )}
      </CardContent>
    </Card>
  );
}

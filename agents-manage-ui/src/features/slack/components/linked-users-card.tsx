'use client';

import { Link2, RefreshCw, Users } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { slackApi } from '../api/slack-api';
import { useSlack } from '../context/slack-provider';

interface LinkedUser {
  id: string;
  slackUserId: string;
  slackTeamId: string;
  slackUsername?: string;
  slackEmail?: string;
  userId: string;
  linkedAt: string;
  lastUsedAt?: string;
}

export function LinkedUsersCard() {
  const { installedWorkspaces } = useSlack();
  const [linkedUsers, setLinkedUsers] = useState<LinkedUser[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedWorkspace = installedWorkspaces.data[0];

  const fetchLinkedUsers = useCallback(async () => {
    if (!selectedWorkspace?.teamId) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await slackApi.getLinkedUsers(selectedWorkspace.teamId);
      setLinkedUsers(result.linkedUsers);
    } catch (err) {
      console.error('Failed to fetch linked users:', err);
      setError('Failed to load linked users');
    } finally {
      setIsLoading(false);
    }
  }, [selectedWorkspace?.teamId]);

  useEffect(() => {
    fetchLinkedUsers();
  }, [fetchLinkedUsers]);

  const formatDate = useCallback((dateStr: string) => {
    return new Date(dateStr).toLocaleString();
  }, []);

  if (!selectedWorkspace) {
    return null;
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            <div>
              <CardTitle className="flex items-center gap-2">
                Linked Users
                <Badge variant="secondary" className="text-xs">
                  {linkedUsers.length}
                </Badge>
              </CardTitle>
              <CardDescription>
                Slack users linked to Inkeep accounts in{' '}
                {selectedWorkspace.teamName || 'this workspace'}
              </CardDescription>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={fetchLinkedUsers} disabled={isLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {error && <p className="text-destructive text-sm text-center py-4">{error}</p>}

        {isLoading && linkedUsers.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-4">Loading...</p>
        ) : linkedUsers.length === 0 ? (
          <div className="text-center py-6">
            <Link2 className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
            <p className="text-muted-foreground text-sm">
              No users have linked their accounts yet.
            </p>
            <p className="text-muted-foreground text-xs mt-1">
              Users can run <code className="bg-muted px-1 rounded">/inkeep link</code> in Slack to
              connect their accounts.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-2">Slack User</th>
                  <th className="text-left py-2 px-2">Inkeep User ID</th>
                  <th className="text-left py-2 px-2">Status</th>
                  <th className="text-left py-2 px-2">Linked At</th>
                  <th className="text-left py-2 px-2">Last Used</th>
                </tr>
              </thead>
              <tbody>
                {linkedUsers.map((user) => (
                  <tr key={user.id} className="border-b">
                    <td className="py-2 px-2">
                      <div>
                        <div className="font-medium">{user.slackUsername || user.slackUserId}</div>
                        {user.slackEmail && (
                          <div className="text-xs text-muted-foreground">{user.slackEmail}</div>
                        )}
                      </div>
                    </td>
                    <td className="py-2 px-2 font-mono text-xs">{user.userId.slice(0, 16)}...</td>
                    <td className="py-2 px-2">
                      <Badge variant="default" className="bg-green-600">
                        Linked
                      </Badge>
                    </td>
                    <td className="py-2 px-2 text-xs">{formatDate(user.linkedAt)}</td>
                    <td className="py-2 px-2 text-xs text-muted-foreground">
                      {user.lastUsedAt ? formatDate(user.lastUsedAt) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

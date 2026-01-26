'use client';

import { RefreshCw, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useSlack } from '../context/slack-context';

export function ConnectedUsersCard() {
  const { userLinks, mounted, removeUserLink, clearAllUserLinks, refreshUserLinks } = useSlack();

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Connected Users</CardTitle>
            <CardDescription>
              Users who have linked their Slack accounts (stored in localStorage for now)
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={refreshUserLinks}>
              <RefreshCw className="h-4 w-4 mr-1" />
              Refresh
            </Button>
            {mounted && userLinks.length > 0 && (
              <Button variant="destructive" size="sm" onClick={clearAllUserLinks}>
                <Trash2 className="h-4 w-4 mr-1" />
                Clear All
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {!mounted ? (
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-muted rounded w-full" />
            <div className="h-10 bg-muted rounded w-full" />
          </div>
        ) : userLinks.length === 0 ? (
          <p className="text-muted-foreground text-sm text-center py-8">
            No users have linked their Slack accounts yet.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Inkeep User</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Slack Team ID</TableHead>
                  <TableHead>Nango Connection</TableHead>
                  <TableHead>Linked At</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {userLinks.map((link) => (
                  <TableRow key={link.appUserId}>
                    <TableCell className="font-medium">{link.appUserName || '—'}</TableCell>
                    <TableCell>{link.appUserEmail || '—'}</TableCell>
                    <TableCell className="font-mono text-xs">{link.slackTeamId}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {link.nangoConnectionId?.substring(0, 8)}...
                    </TableCell>
                    <TableCell>
                      {link.linkedAt ? new Date(link.linkedAt).toLocaleDateString() : '—'}
                    </TableCell>
                    <TableCell>
                      <Badge variant={link.isLinked ? 'default' : 'secondary'}>
                        {link.isLinked ? 'Linked' : 'Disconnected'}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removeUserLink(link.appUserId)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

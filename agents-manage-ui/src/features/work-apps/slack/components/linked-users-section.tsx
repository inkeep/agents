'use client';

import {
  Download,
  Link2,
  Loader2,
  MoreHorizontal,
  RefreshCw,
  Trash2,
  UserMinus,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useSlackLinkedUsersQuery, useSlackUnlinkUserMutation } from '../api/queries';
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

export function LinkedUsersSection() {
  const { installedWorkspaces } = useSlack();
  const [expanded, setExpanded] = useState(false);
  const [userToUnlink, setUserToUnlink] = useState<LinkedUser | null>(null);

  const selectedWorkspace = installedWorkspaces.data[0];

  const {
    data: linkedUsersData,
    isLoading,
    refetch: fetchLinkedUsers,
  } = useSlackLinkedUsersQuery(selectedWorkspace?.teamId);

  const linkedUsers = linkedUsersData?.linkedUsers ?? [];

  const unlinkMutation = useSlackUnlinkUserMutation();

  const handleUnlinkUser = async () => {
    if (!userToUnlink) return;

    try {
      await unlinkMutation.mutateAsync({
        slackUserId: userToUnlink.slackUserId,
        slackTeamId: userToUnlink.slackTeamId,
      });

      toast.success(
        `${userToUnlink.slackUsername || 'User'} has been unlinked from their Inkeep account`
      );
    } catch (err) {
      console.error('Failed to unlink user:', err);
      toast.error('Failed to unlink user. Please try again.');
    } finally {
      setUserToUnlink(null);
    }
  };

  const handleExportUsers = async () => {
    if (!selectedWorkspace?.teamId) return;

    try {
      const csvContent = await slackApi.exportLinkedUsers(selectedWorkspace.teamId);
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `linked-users-${selectedWorkspace.teamId}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Exported linked users to CSV');
    } catch (err) {
      console.error('Failed to export users:', err);
      toast.error('Failed to export users');
    }
  };

  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    return date.toLocaleDateString();
  };

  if (!selectedWorkspace) {
    return null;
  }

  const UserRow = ({ user }: { user: LinkedUser }) => (
    <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors group">
      <Avatar className="h-8 w-8">
        <AvatarFallback className="text-xs bg-primary/10 text-primary">
          {(user.slackUsername || user.slackEmail || 'U')[0].toUpperCase()}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {user.slackUsername || user.slackEmail || 'Unknown User'}
        </p>
        <p className="text-xs text-muted-foreground">Linked {formatRelativeTime(user.linkedAt)}</p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-xs bg-green-500/10 text-green-600 shrink-0">
          Active
        </Badge>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              aria-label="User options"
              className="h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setUserToUnlink(user)} variant="destructive">
              <UserMinus className="h-4 w-4" />
              Unlink user
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4" />
                Linked Users
                {linkedUsers.length > 0 && (
                  <Badge variant="secondary" className="text-xs font-normal">
                    {linkedUsers.length}
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Manage Slack users linked to Inkeep accounts
              </CardDescription>
            </div>
            <div className="flex items-center gap-1">
              {linkedUsers.length > 0 && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={handleExportUsers}
                  className="h-8 w-8"
                  aria-label="Export linked users to CSV"
                  title="Export to CSV"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                onClick={() => fetchLinkedUsers()}
                disabled={isLoading}
                className="h-8 w-8"
                aria-label="Refresh linked users"
                title="Refresh"
              >
                {isLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {isLoading && linkedUsers.length === 0 ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : linkedUsers.length === 0 ? (
            <div className="text-center py-6 space-y-2">
              <div className="rounded-full bg-muted p-3 w-fit mx-auto">
                <Link2 className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No users linked yet</p>
              <p className="text-xs text-muted-foreground">
                Users can run{' '}
                <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/inkeep link</code> in
                Slack
              </p>
            </div>
          ) : (
            <Collapsible open={expanded} onOpenChange={setExpanded}>
              <div className="space-y-1">
                {linkedUsers.slice(0, 3).map((user) => (
                  <UserRow key={user.id} user={user} />
                ))}

                {linkedUsers.length > 3 && (
                  <>
                    <CollapsibleContent className="space-y-1">
                      {linkedUsers.slice(3).map((user) => (
                        <UserRow key={user.id} user={user} />
                      ))}
                    </CollapsibleContent>

                    <CollapsibleTrigger asChild>
                      <Button variant="ghost" size="sm" className="w-full text-xs mt-2">
                        {expanded ? 'Show less' : `Show ${linkedUsers.length - 3} more`}
                      </Button>
                    </CollapsibleTrigger>
                  </>
                )}
              </div>
            </Collapsible>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!userToUnlink} onOpenChange={(open) => !open && setUserToUnlink(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Unlink User
            </AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to unlink{' '}
              <strong>{userToUnlink?.slackUsername || 'this user'}</strong> from their Inkeep
              account?
              <br />
              <br />
              They will need to run{' '}
              <code className="bg-muted px-1.5 py-0.5 rounded text-xs">/inkeep link</code> again to
              reconnect.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unlinkMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleUnlinkUser}
              disabled={unlinkMutation.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {unlinkMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Unlinking...
                </>
              ) : (
                'Unlink User'
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

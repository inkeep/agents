'use client';

import { AlertCircle, UserPlus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { slackApi } from '../api/slack-api';
import { useSlack } from '../context/slack-provider';

export function JoinFromWorkspaceToggle() {
  const { installedWorkspaces } = useSlack();
  const workspace = installedWorkspaces.data?.[0];

  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState(false);

  // Fetch the setting from the dedicated endpoint
  useEffect(() => {
    if (!workspace?.teamId) return;

    slackApi
      .getJoinFromWorkspaceSetting(workspace.teamId)
      .then((result) => {
        setIsEnabled(result.shouldAllowJoinFromWorkspace);
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [workspace?.teamId]);

  // Don't render if no workspace data available
  if (!workspace || isLoading) {
    return null;
  }

  const handleToggle = async (enabled: boolean) => {
    if (!workspace?.teamId) {
      toast.error('No workspace found');
      return;
    }

    setIsUpdating(true);
    try {
      await slackApi.updateJoinFromWorkspaceSetting(workspace.teamId, enabled);
      setIsEnabled(enabled);
      toast.success(
        enabled
          ? 'Any user from this Slack workspace can now join your Inkeep organization.'
          : 'Disabled. Users will need to be invited by an administrator.'
      );
    } catch (error) {
      toast.error('Failed to update join from workspace setting');
      console.error('Failed to update join from workspace setting:', error);
      setIsEnabled(!enabled); // Revert optimistic update
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-muted-foreground" />
            <span className="text-base font-medium">Join from Workspace</span>
          </CardTitle>
          <Badge variant={isEnabled ? 'default' : 'secondary'}>
            {isEnabled ? 'Enabled' : 'Disabled'}
          </Badge>
        </div>
        <CardDescription>
          Allow any user from this Slack workspace to join your Inkeep organization.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <Label htmlFor="join-from-workspace-switch" className="text-sm font-medium">
            Allow workspace members to join
          </Label>
          <Switch
            id="join-from-workspace-switch"
            checked={isEnabled}
            onCheckedChange={handleToggle}
            disabled={isUpdating}
          />
        </div>

        {isEnabled && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              <p>
                When users in this Slack workspace run{' '}
                <code className="bg-muted px-1 py-0.5 rounded">/inkeep link</code>, they'll be
                prompted to create an Inkeep account and join your organization.
              </p>
            </AlertDescription>
          </Alert>
        )}

        {!isEnabled && (
          <Alert>
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="text-sm">
              Users will need to be invited by an organization admin.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}

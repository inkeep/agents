'use client';

import { type OrgRole, OrgRoles } from '@inkeep/agents-core/client-exports';
import { AlertCircle, Check } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuthClient } from '@/contexts/auth-client';
import { OrgRoleSelector } from './org-role-selector';

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  isOrgAdmin: boolean;
  onInvitationsSent?: () => void;
}

interface InvitationResult {
  email: string;
  status: 'success' | 'error';
  link?: string;
  error?: string;
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  isOrgAdmin,
  onInvitationsSent,
}: InviteMemberDialogProps) {
  const params = useParams();
  const organizationId = params.tenantId as string;
  const authClient = useAuthClient();

  const [emails, setEmails] = useState('');
  const [selectedRole, setSelectedRole] = useState<OrgRole>(OrgRoles.MEMBER);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitationResults, setInvitationResults] = useState<InvitationResult[]>([]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!emails.trim()) {
      setError('At least one email is required');
      return;
    }

    if (!organizationId) {
      setError('No organization selected');
      return;
    }

    if (!isOrgAdmin) {
      setError('You are not authorized to invite members');
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setInvitationResults([]);

    // Parse comma-separated emails and clean them
    const emailList = emails
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emailList.filter((e) => !emailRegex.test(e));

    if (invalidEmails.length > 0) {
      setError(`Invalid email format: ${invalidEmails.join(', ')}`);
      setIsSubmitting(false);
      return;
    }

    const results: InvitationResult[] = [];

    // Create invitations for each email
    for (const email of emailList) {
      try {
        const result = await authClient.organization.inviteMember({
          email,
          role: selectedRole,
          organizationId,
        });

        if ('error' in result && result.error) {
          results.push({
            email,
            status: 'error',
            error: result.error.message || 'Failed to add member',
          });
        } else if ('data' in result && result.data && 'id' in result.data) {
          const invitationId = result.data.id;
          const baseUrl = window.location.origin;
          const link = `${baseUrl}/accept-invitation/${invitationId}`;
          results.push({
            email,
            status: 'success',
            link,
          });
        } else {
          results.push({
            email,
            status: 'error',
            error: 'Failed to add member',
          });
        }
      } catch (err) {
        results.push({
          email,
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to add member',
        });
      }
    }

    setInvitationResults(results);
    setIsSubmitting(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      const hadSuccessfulInvitations = invitationResults.some((r) => r.status === 'success');
      setEmails('');
      setSelectedRole(OrgRoles.MEMBER);
      setError(null);
      setInvitationResults([]);
      onOpenChange(newOpen);
      if (!newOpen && hadSuccessfulInvitations) {
        onInvitationsSent?.();
      }
    }
  };

  const hasResults = invitationResults.length > 0;
  const successCount = invitationResults.filter((r) => r.status === 'success').length;
  const errorCount = invitationResults.filter((r) => r.status === 'error').length;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {hasResults ? 'Team Members Added' : 'Add Team Members'}
          </DialogTitle>
          <DialogDescription>
            {hasResults
              ? `${successCount} successful, ${errorCount} failed`
              : 'Enter one or more email addresses (comma-separated) to add members to your organization.'}
          </DialogDescription>
        </DialogHeader>

        {!hasResults ? (
          <form onSubmit={handleSubmit}>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="emails">Email addresses</Label>
                <Textarea
                  id="emails"
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  disabled={isSubmitting}
                  autoFocus
                  required
                  rows={3}
                  placeholder="user@example.com, another@example.com, ..."
                  className="resize-none"
                />
                <p className="text-xs text-muted-foreground">
                  Separate multiple email addresses with commas
                </p>
              </div>

              <div className="grid gap-2">
                <Label>Role</Label>
                <OrgRoleSelector
                  value={selectedRole}
                  onChange={setSelectedRole}
                  disabled={isSubmitting}
                  triggerClassName="w-full h-auto py-2"
                />
              </div>

              {error && (
                <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {error}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting || !emails.trim()}>
                {isSubmitting ? 'Adding...' : 'Add Members'}
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4 py-4">
            <div className="space-y-3 max-h-[400px] overflow-y-auto">
              {invitationResults.map((result, index) => (
                <div
                  key={index}
                  className={`rounded-md border p-3 ${
                    result.status === 'success'
                      ? 'border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950'
                      : 'border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        {result.status === 'success' ? (
                          <Check className="h-4 w-4 text-green-600 shrink-0" />
                        ) : (
                          <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                        )}
                        <span className="font-medium text-sm truncate">{result.email}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {successCount > 0 && (
              <div className="rounded-md bg-blue-500/10 p-3 text-sm text-blue-600 dark:text-blue-400">
                <p className="font-medium mb-1">Next Steps:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>They'll sign in with the email they were added with</li>
                  <li>They'll click "Accept Invitation" to join your organization</li>
                </ol>
              </div>
            )}

            <DialogFooter>
              <Button type="button" onClick={() => handleOpenChange(false)}>
                Done
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

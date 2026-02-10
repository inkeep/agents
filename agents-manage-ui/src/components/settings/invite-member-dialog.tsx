'use client';

import { type OrgRole, OrgRoles } from '@inkeep/agents-core/client-exports';
import { AlertCircle, Check, ChevronDown, Copy } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuthClient } from '@/contexts/auth-client';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { OrgRoleSelector } from './org-role-selector';

type InviteAuthMethod = 'email-password' | 'google' | 'sso';

interface AuthMethodOption {
  value: InviteAuthMethod;
  label: string;
  description: string;
}

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
  const { PUBLIC_AUTH0_DOMAIN, PUBLIC_GOOGLE_CLIENT_ID } = useRuntimeConfig();

  // Build available auth methods based on env config
  // Priority: Google > SSO > Email+Password
  const authMethodOptions = useMemo<AuthMethodOption[]>(() => {
    const options: AuthMethodOption[] = [];

    if (PUBLIC_GOOGLE_CLIENT_ID) {
      options.push({
        value: 'google',
        label: 'Google',
        description: 'User will sign in with their Google account',
      });
    }

    if (PUBLIC_AUTH0_DOMAIN) {
      options.push({
        value: 'sso',
        label: 'Inkeep SSO',
        description: 'User will sign in with Inkeep SSO',
      });
    }

    // Email+Password is always available
    options.push({
      value: 'email-password',
      label: 'Email and password',
      description: 'User will create a password via invite link',
    });

    return options;
  }, [PUBLIC_GOOGLE_CLIENT_ID, PUBLIC_AUTH0_DOMAIN]);

  // Default to the first available method (based on priority)
  const defaultAuthMethod = authMethodOptions[0]?.value ?? 'email-password';

  const [emails, setEmails] = useState('');
  const [selectedRole, setSelectedRole] = useState<OrgRole>(OrgRoles.MEMBER);
  const [selectedAuthMethod, setSelectedAuthMethod] = useState<InviteAuthMethod>(defaultAuthMethod);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitationResults, setInvitationResults] = useState<InvitationResult[]>([]);

  const selectedAuthOption = authMethodOptions.find((o) => o.value === selectedAuthMethod);

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
          authMethod: selectedAuthMethod,
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
          const link = `${baseUrl}/accept-invitation/${invitationId}?email=${encodeURIComponent(email)}`;
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
      setSelectedAuthMethod(defaultAuthMethod);
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

              <div className="grid gap-2">
                <Label>Sign-in method</Label>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={`gap-1 normal-case text-xs justify-between`}
                      disabled={isSubmitting}
                    >
                      <span className="flex items-center gap-2">{selectedAuthOption?.label}</span>
                      <ChevronDown className="size-3 shrink-0" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="w-[--radix-dropdown-menu-trigger-width]"
                  >
                    {authMethodOptions.map((option) => (
                      <DropdownMenuItem
                        key={option.value}
                        onClick={() => setSelectedAuthMethod(option.value)}
                        className={selectedAuthMethod === option.value ? 'bg-muted' : ''}
                      >
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-2">{option.label}</span>
                          <span className="text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        </div>
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
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
                <div key={index} className="rounded-md border p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      {result.status === 'success' ? (
                        <Check className="h-4 w-4 text-muted-foreground shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                      )}
                      <span className="font-medium text-sm truncate">{result.email}</span>
                    </div>
                    {result.status === 'success' &&
                      selectedAuthMethod === 'email-password' &&
                      result.link && (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs gap-1 shrink-0"
                          onClick={() => {
                            if (result.link) {
                              navigator.clipboard.writeText(result.link);
                              toast.success('Invite link copied');
                            }
                          }}
                        >
                          <Copy className="h-3 w-3" />
                          Copy link
                        </Button>
                      )}
                  </div>
                  {result.status === 'error' && result.error && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2 ml-6">
                      {result.error}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {successCount > 0 && (
              <div className="rounded-md bg-blue-500/10 p-3 text-sm text-blue-600 dark:text-blue-400">
                <p className="font-medium mb-1">Next Steps:</p>
                <p className="text-xs">
                  {selectedAuthMethod === 'email-password' ? (
                    successCount === 1 ? (
                      <>
                        Share the invite link with the user. They'll use it to create their account
                        and join your organization.
                      </>
                    ) : (
                      <>
                        Share the invite links with the users. They'll use them to create their
                        accounts and join your organization.
                      </>
                    )
                  ) : successCount === 1 ? (
                    <>
                      Let the user know they can sign in at{' '}
                      <span className="font-medium">{window.location.origin}/login</span> using{' '}
                      {selectedAuthMethod === 'google' ? 'Google' : 'Inkeep SSO'}. They'll
                      automatically join your organization.
                    </>
                  ) : (
                    <>
                      Let the users know they can sign in at{' '}
                      <span className="font-medium">{window.location.origin}/login</span> using{' '}
                      {selectedAuthMethod === 'google' ? 'Google' : 'Inkeep SSO'}. They'll
                      automatically join your organization.
                    </>
                  )}
                </p>
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

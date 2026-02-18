'use client';

import { type OrgRole, OrgRoles } from '@inkeep/agents-core/client-exports';
import { AlertCircle, Check, ChevronDown, Copy, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthClient } from '@/contexts/auth-client';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { OrgRoleSelector } from './org-role-selector';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const NAME_EMAIL_REGEX = /[\w\d.+-]+@[\w\d.-]+\.[\w\d.-]+/g;

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
  initialEmails?: string[];
  initialRole?: OrgRole;
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
  initialEmails,
  initialRole,
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

  const [emailChips, setEmailChips] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [selectedRole, setSelectedRole] = useState<OrgRole>(OrgRoles.MEMBER);
  const [selectedAuthMethod, setSelectedAuthMethod] = useState<InviteAuthMethod>(defaultAuthMethod);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitationResults, setInvitationResults] = useState<InvitationResult[]>([]);
  const chipInputRef = useRef<HTMLInputElement>(null);
  const roleSelectorRef = useRef<HTMLButtonElement>(null);

  const addEmailChip = useCallback((email: string) => {
    const trimmed = email.trim();
    if (!trimmed) return;
    if (!EMAIL_REGEX.test(trimmed)) {
      toast.error(`Invalid email: ${trimmed}`);
      return;
    }
    setEmailChips((prev) => (prev.includes(trimmed) ? prev : [...prev, trimmed]));
  }, []);

  const parseAndAddEmails = useCallback((text: string) => {
    const extracted = text.match(NAME_EMAIL_REGEX);
    if (extracted) {
      const unique = [...new Set(extracted)];
      setEmailChips((prev) => [...new Set([...prev, ...unique])]);
    }
  }, []);

  useEffect(() => {
    if (open) {
      if (initialEmails && initialEmails.length > 0) {
        setEmailChips(initialEmails);
      }
      if (initialRole) {
        setSelectedRole(initialRole);
      }
      setTimeout(() => roleSelectorRef.current?.focus(), 100);
    }
  }, [open, initialEmails, initialRole]);

  const selectedAuthOption = authMethodOptions.find((o) => o.value === selectedAuthMethod);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Commit any pending input before submitting
    const finalChips = [...emailChips];
    if (emailInput.trim()) {
      const extracted = emailInput.match(NAME_EMAIL_REGEX);
      if (extracted) {
        for (const em of extracted) {
          if (!finalChips.includes(em)) finalChips.push(em);
        }
      } else if (EMAIL_REGEX.test(emailInput.trim())) {
        if (!finalChips.includes(emailInput.trim())) finalChips.push(emailInput.trim());
      }
      setEmailInput('');
      setEmailChips(finalChips);
    }

    if (finalChips.length === 0) {
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

    const results: InvitationResult[] = [];

    // Create invitations for each email
    for (const email of finalChips) {
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

  const handleChipKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (emailInput.trim()) {
        const extracted = emailInput.match(NAME_EMAIL_REGEX);
        if (extracted) {
          for (const em of extracted) addEmailChip(em);
        } else {
          addEmailChip(emailInput);
        }
        setEmailInput('');
      }
    }
    if (e.key === 'Tab' && emailInput.trim()) {
      e.preventDefault();
      addEmailChip(emailInput);
      setEmailInput('');
    }
    if (e.key === 'Backspace' && emailInput === '' && emailChips.length > 0) {
      setEmailChips((prev) => prev.slice(0, -1));
    }
  };

  const handleChipPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    parseAndAddEmails(pasted);
  };

  const removeEmailChip = (email: string) => {
    setEmailChips((prev) => prev.filter((e) => e !== email));
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      const hadSuccessfulInvitations = invitationResults.some((r) => r.status === 'success');
      setEmailChips([]);
      setEmailInput('');
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
                <Label>Role</Label>
                <OrgRoleSelector
                  value={selectedRole}
                  onChange={setSelectedRole}
                  disabled={isSubmitting}
                  triggerClassName="w-full h-auto py-2"
                  ref={roleSelectorRef}
                />
              </div>

              <div className="grid gap-2">
                <Label htmlFor="emails">Email addresses</Label>
                <div
                  role="textbox"
                  tabIndex={-1}
                  className="flex min-h-[80px] w-full flex-wrap items-start gap-1.5 rounded-md border border-input bg-transparent px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2 cursor-text"
                  onClick={() => chipInputRef.current?.focus()}
                  onKeyDown={() => chipInputRef.current?.focus()}
                >
                  <TooltipProvider>
                    {emailChips.map((email) => (
                      <Tooltip key={email}>
                        <TooltipTrigger asChild>
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 text-sm bg-primary/10 text-primary rounded-full">
                            <span className="max-w-[200px] truncate">{email}</span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeEmailChip(email);
                              }}
                              className="hover:text-destructive"
                              aria-label={`Remove ${email}`}
                              disabled={isSubmitting}
                            >
                              <X className="size-3" aria-hidden="true" />
                            </button>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>{email}</TooltipContent>
                      </Tooltip>
                    ))}
                  </TooltipProvider>
                  <input
                    ref={chipInputRef}
                    id="emails"
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    onKeyDown={handleChipKeyDown}
                    onPaste={handleChipPaste}
                    placeholder={
                      emailChips.length === 0 ? 'user@example.com, Name <email>, ...' : ''
                    }
                    aria-label="Email address to invite"
                    className="flex-1 min-w-[150px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
                    disabled={isSubmitting}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Paste emails from your email client — supports &quot;Name &lt;email&gt;&quot;
                  format
                </p>
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
              <Button
                type="submit"
                disabled={isSubmitting || (emailChips.length === 0 && !emailInput.trim())}
              >
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

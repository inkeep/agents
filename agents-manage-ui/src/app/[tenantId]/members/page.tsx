'use client';

import { UserPlus, X } from 'lucide-react';
import { use, useCallback, useEffect, useRef, useState } from 'react';
import { ErrorContent } from '@/components/errors/full-page-error';
import { InviteMemberDialog } from '@/components/settings/invite-member-dialog';
import { MembersTable } from '@/components/settings/members-table';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { OrgRoles } from '@/constants/signoz';
import { useAuthClient } from '@/contexts/auth-client';
import { getUserProviders, type UserProvider } from '@/lib/actions/user-accounts';
import MembersLoadingSkeleton from './loading';

type FullOrganization = NonNullable<
  Awaited<
    ReturnType<ReturnType<typeof useAuthClient>['organization']['getFullOrganization']>
  >['data']
>;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function MembersPage({ params }: PageProps<'/[tenantId]/members'>) {
  const authClient = useAuthClient();
  const { tenantId } = use(params);
  const [organization, setOrganization] = useState<FullOrganization | null>();
  const [currentMember, setCurrentMember] = useState<typeof authClient.$Infer.Member | null>(null);
  const [pendingInvitations, setPendingInvitations] = useState<
    (typeof authClient.$Infer.Invitation)[]
  >([]);
  const [memberProviders, setMemberProviders] = useState<UserProvider[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [emailChips, setEmailChips] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState('');
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const fetchOrganization = useCallback(async () => {
    if (!tenantId) return;

    try {
      const [orgResult, memberResult, invitationsResult] = await Promise.all([
        authClient.organization.getFullOrganization({
          query: {
            organizationId: tenantId,
            membersLimit: 100,
          },
        }),
        authClient.organization.getActiveMember(),
        authClient.organization.listInvitations({
          query: { organizationId: tenantId },
        }),
      ]);

      if (orgResult.error) {
        setError(orgResult.error.message || 'Failed to fetch organization');
        return;
      }

      if (orgResult.data) {
        setOrganization(orgResult.data);

        const userIds = orgResult.data.members?.map((m) => m.user.id) || [];
        if (userIds.length > 0) {
          const providers = await getUserProviders(userIds, tenantId);
          setMemberProviders(providers);
        }
      }

      if (memberResult.data) {
        setCurrentMember(memberResult.data);
      }

      if (invitationsResult.data) {
        const pending = invitationsResult.data.filter((inv) => inv.status === 'pending');
        setPendingInvitations(pending);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch organization');
    } finally {
      setLoading(false);
    }
  }, [tenantId, authClient]);

  useEffect(() => {
    fetchOrganization();
  }, [fetchOrganization]);

  const isOrgAdmin =
    currentMember?.role === OrgRoles.OWNER || currentMember?.role === OrgRoles.ADMIN;

  const addEmailChip = (email: string) => {
    const trimmed = email.trim();
    if (!trimmed) return;
    if (!EMAIL_REGEX.test(trimmed)) return;
    if (emailChips.includes(trimmed)) return;
    setEmailChips((prev) => [...prev, trimmed]);
  };

  const handleEmailKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') {
      e.preventDefault();
      addEmailChip(emailInput);
      setEmailInput('');
    }
    if (e.key === 'Backspace' && emailInput === '' && emailChips.length > 0) {
      setEmailChips((prev) => prev.slice(0, -1));
    }
  };

  const handleEmailPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text');
    const emails = pasted
      .split(/[,\n\r]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const validEmails = emails.filter((email) => EMAIL_REGEX.test(email));
    setEmailChips((prev) => [...new Set([...prev, ...validEmails])]);
  };

  const removeEmailChip = (email: string) => {
    setEmailChips((prev) => prev.filter((e) => e !== email));
  };

  const handleAddClick = () => {
    let hasEmails = emailChips.length > 0;
    if (emailInput.trim() && EMAIL_REGEX.test(emailInput.trim())) {
      addEmailChip(emailInput);
      setEmailInput('');
      hasEmails = true;
    }
    if (hasEmails) {
      setInviteDialogOpen(true);
    }
  };

  const handleInviteDialogChange = (open: boolean) => {
    setInviteDialogOpen(open);
    if (!open) {
      setEmailChips([]);
      setEmailInput('');
    }
  };

  if (loading) {
    return <MembersLoadingSkeleton />;
  }

  if (error || !organization) {
    return (
      <ErrorContent
        error={new Error(error || 'Failed to load organization')}
        context="organization"
      />
    );
  }

  return (
    <div className="space-y-6">
      {isOrgAdmin && (
        <div className="flex gap-2 items-start">
          <div className="flex-1 flex items-center gap-2 min-h-10 px-3 py-2 border rounded-md bg-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
            <div className="flex-1 flex items-center flex-wrap gap-1.5 min-w-0">
              <UserPlus className="size-4 text-muted-foreground shrink-0" />
              <TooltipProvider>
                {emailChips.map((email) => (
                  <Tooltip key={email}>
                    <TooltipTrigger asChild>
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-sm bg-primary/10 text-primary rounded-full">
                        <span className="max-w-[150px] truncate">{email}</span>
                        <button
                          type="button"
                          onClick={() => removeEmailChip(email)}
                          className="hover:text-destructive"
                        >
                          <X className="size-3" />
                        </button>
                      </span>
                    </TooltipTrigger>
                    <TooltipContent>{email}</TooltipContent>
                  </Tooltip>
                ))}
              </TooltipProvider>
              <input
                ref={inputRef}
                type="text"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={handleEmailKeyDown}
                onPaste={handleEmailPaste}
                placeholder={emailChips.length === 0 ? 'Invite by email...' : ''}
                className="flex-1 min-w-[120px] bg-transparent outline-none text-sm placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <Button
            onClick={handleAddClick}
            disabled={emailChips.length === 0 && !emailInput.trim()}
            className="h-10"
          >
            Add
          </Button>
        </div>
      )}

      <MembersTable
        members={organization?.members || []}
        pendingInvitations={pendingInvitations}
        currentMember={currentMember}
        organizationId={tenantId}
        onMemberUpdated={fetchOrganization}
        isOrgAdmin={isOrgAdmin}
        memberProviders={memberProviders}
        hideAddButton
      />

      <InviteMemberDialog
        open={inviteDialogOpen}
        onOpenChange={handleInviteDialogChange}
        isOrgAdmin={isOrgAdmin}
        onInvitationsSent={fetchOrganization}
        initialEmails={emailChips}
      />
    </div>
  );
}

'use client';

import {
  type OrgRole,
  OrgRoles,
  type ProjectRole,
  ProjectRoles,
} from '@inkeep/agents-core/client-exports';
import { AlertCircle, Check, Copy, Mail, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { getInvitationEmailStatus, inviteMembers } from '@/lib/actions/invitations';
import { fetchProjects } from '@/lib/api/projects';
import { ProjectRoleSelector } from '../access/project-role-selector';
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
  compensated?: boolean;
  emailSent?: boolean;
  emailError?: string;
}

interface ProjectOption {
  id: string;
  name: string;
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  isOrgAdmin,
  onInvitationsSent,
}: InviteMemberDialogProps) {
  const params = useParams();
  const organizationId = params.tenantId as string;
  const { PUBLIC_IS_SMTP_CONFIGURED } = useRuntimeConfig();

  const [emails, setEmails] = useState('');
  const [selectedRole, setSelectedRole] = useState<OrgRole>(OrgRoles.MEMBER);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitationResults, setInvitationResults] = useState<InvitationResult[]>([]);

  const [projects, setProjects] = useState<ProjectOption[]>([]);
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  const [projectSearch, setProjectSearch] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [projectRole, setProjectRole] = useState<ProjectRole>(ProjectRoles.MEMBER);

  useEffect(() => {
    if (open && selectedRole === OrgRoles.MEMBER) {
      setIsLoadingProjects(true);
      fetchProjects(organizationId)
        .then((response) => {
          const list: ProjectOption[] = [];
          for (const p of response?.data ?? []) {
            if (typeof p.id === 'string') {
              list.push({ id: p.id, name: p.name });
            }
          }
          setProjects(list);
        })
        .catch(() => {
          setProjects([]);
        })
        .then(() => {
          setIsLoadingProjects(false);
        });
    }
  }, [open, selectedRole, organizationId]);

  const filteredProjects = projects
    .filter((p) => p.name.toLowerCase().includes(projectSearch.toLowerCase()))
    .sort((a, b) => a.name.localeCompare(b.name));

  const allFilteredSelected =
    filteredProjects.length > 0 && filteredProjects.every((p) => selectedProjectIds.has(p.id));

  const toggleSelectAll = () => {
    if (allFilteredSelected) {
      setSelectedProjectIds((prev) => {
        const next = new Set(prev);
        for (const p of filteredProjects) next.delete(p.id);
        return next;
      });
    } else {
      setSelectedProjectIds((prev) => {
        const next = new Set(prev);
        for (const p of filteredProjects) next.add(p.id);
        return next;
      });
    }
  };

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

    const emailList = emails
      .split(',')
      .map((e) => e.trim())
      .filter((e) => e.length > 0);

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const invalidEmails = emailList.filter((e) => !emailRegex.test(e));

    if (invalidEmails.length > 0) {
      setError(`Invalid email format: ${invalidEmails.join(', ')}`);
      setIsSubmitting(false);
      return;
    }

    const assignments =
      selectedRole === OrgRoles.MEMBER && selectedProjectIds.size > 0
        ? Array.from(selectedProjectIds).map((projectId) => ({ projectId, projectRole }))
        : undefined;

    const response = await inviteMembers({
      emails: emailList,
      role: selectedRole,
      organizationId,
      assignments,
    });

    if (!response.success) {
      setError(response.error);
      setIsSubmitting(false);
      return;
    }

    const results: InvitationResult[] = [];

    for (const item of response.results) {
      if (item.status === 'error') {
        results.push({
          email: item.email,
          status: 'error',
          error: item.error ?? 'Failed to add member',
          compensated: item.compensated,
        });
        continue;
      }

      const invitationId = item.id;
      const baseUrl = window.location.origin;
      const link = invitationId
        ? `${baseUrl}/accept-invitation/${invitationId}?email=${encodeURIComponent(item.email)}`
        : undefined;

      let emailSent = false;
      let emailError: string | undefined;
      if (PUBLIC_IS_SMTP_CONFIGURED && invitationId) {
        const status = await getInvitationEmailStatus(invitationId);
        emailSent = status.emailSent;
        emailError = status.error;
      }

      results.push({ email: item.email, status: 'success', link, emailSent, emailError });
    }

    setInvitationResults(results);

    const successfulResults = results.filter((r) => r.status === 'success' && r.link);
    if (
      !PUBLIC_IS_SMTP_CONFIGURED &&
      successfulResults.length === 1 &&
      successfulResults[0]?.link
    ) {
      navigator.clipboard.writeText(successfulResults[0].link).catch(() => {});
    }
    setIsSubmitting(false);
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      const hadSuccessfulInvitations = invitationResults.some((r) => r.status === 'success');
      setEmails('');
      setSelectedRole(OrgRoles.MEMBER);
      setError(null);
      setInvitationResults([]);
      setSelectedProjectIds(new Set());
      setProjectRole(ProjectRoles.MEMBER);
      setProjectSearch('');
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
                <textarea
                  id="emails"
                  value={emails}
                  onChange={(e) => setEmails(e.target.value)}
                  disabled={isSubmitting}
                  autoFocus
                  required
                  rows={3}
                  placeholder="user@example.com, another@example.com, ..."
                  className="flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none"
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

              {selectedRole === OrgRoles.MEMBER ? (
                <div className="grid gap-2">
                  <div className="flex items-center justify-between">
                    <Label>Projects (optional)</Label>
                    {selectedProjectIds.size > 0 && (
                      <span className="text-xs text-muted-foreground">
                        {selectedProjectIds.size} selected
                      </span>
                    )}
                  </div>

                  {isLoadingProjects ? (
                    <p className="text-xs text-muted-foreground">Loading projects...</p>
                  ) : projects.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No projects available.</p>
                  ) : (
                    <div className="border rounded-md">
                      <div className="p-2 border-b relative">
                        <Input
                          placeholder="Search projects..."
                          value={projectSearch}
                          onChange={(e) => setProjectSearch(e.target.value)}
                          className="h-7 text-sm pr-7"
                          disabled={isSubmitting}
                        />
                        {projectSearch && (
                          <button
                            type="button"
                            className="absolute right-3.5 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100"
                            onClick={() => setProjectSearch('')}
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                      <div className="p-2 border-b flex items-center gap-2">
                        <Checkbox
                          id="select-all-projects"
                          checked={allFilteredSelected}
                          onCheckedChange={toggleSelectAll}
                          disabled={isSubmitting || filteredProjects.length === 0}
                        />
                        <label
                          htmlFor="select-all-projects"
                          className="text-xs text-muted-foreground cursor-pointer"
                        >
                          Select all projects
                        </label>
                      </div>
                      <div
                        className={`overflow-y-auto ${projects.length > 6 ? 'h-[200px] contain-strict' : 'max-h-[200px]'}`}
                      >
                        {filteredProjects.length === 0 ? (
                          <p className="text-xs text-muted-foreground p-2">No matching projects</p>
                        ) : (
                          filteredProjects.map((p) => (
                            <div
                              key={p.id}
                              className="flex items-center gap-2 px-2 h-8 hover:bg-muted/50"
                            >
                              <Checkbox
                                id={`project-${p.id}`}
                                checked={selectedProjectIds.has(p.id)}
                                onCheckedChange={(checked) => {
                                  setSelectedProjectIds((prev) => {
                                    const next = new Set(prev);
                                    if (checked) next.add(p.id);
                                    else next.delete(p.id);
                                    return next;
                                  });
                                }}
                                disabled={isSubmitting}
                              />
                              <label
                                htmlFor={`project-${p.id}`}
                                className="text-sm cursor-pointer flex-1"
                              >
                                {p.name}
                              </label>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1">
                    <Label className="text-xs text-muted-foreground">
                      Role for selected projects
                    </Label>
                    <ProjectRoleSelector
                      value={projectRole}
                      onChange={setProjectRole}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Org admins have access to all projects automatically.
                </p>
              )}

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
                    {result.status === 'success' && result.link && (
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
                  {result.status === 'success' && selectedProjectIds.size > 0 && (
                    <p className="text-xs text-muted-foreground mt-1 ml-6">
                      Invited + added to {selectedProjectIds.size} project
                      {selectedProjectIds.size !== 1 ? 's' : ''}
                    </p>
                  )}
                  {result.status === 'success' && result.emailSent && (
                    <p className="text-xs text-muted-foreground mt-1 ml-6 flex items-center gap-1">
                      <Mail className="h-3 w-3" aria-hidden="true" />
                      Invitation email sent
                    </p>
                  )}
                  {result.status === 'success' &&
                    PUBLIC_IS_SMTP_CONFIGURED &&
                    !result.emailSent && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 ml-6">
                        {result.emailError
                          ? 'Email could not be sent. Copy the link to share manually.'
                          : 'Email status unknown. Copy the link to share manually.'}
                      </p>
                    )}
                  {result.status === 'error' && result.compensated && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2 ml-6">
                      Invitation failed — project assignment error. Please re-invite and add to
                      projects manually.
                    </p>
                  )}
                  {result.status === 'error' && !result.compensated && result.error && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-2 ml-6">
                      {result.error}
                    </p>
                  )}
                </div>
              ))}
            </div>

            {successCount > 0 && (
              <div className="rounded-md bg-blue-500/10 p-3 text-sm text-blue-600 dark:text-blue-400">
                {invitationResults.some((r) => r.emailSent) ? (
                  <p className="text-xs">
                    {successCount === 1
                      ? 'An invitation email has been sent. The invite link is also available as a backup.'
                      : 'Invitation emails have been sent. Invite links are also available as a backup.'}
                  </p>
                ) : successCount === 1 ? (
                  <p className="text-xs">
                    An invite link has been copied to your clipboard. Share the invite link with
                    your team member to have them join!
                  </p>
                ) : (
                  <ol className="text-xs list-decimal list-inside space-y-1">
                    <li>Copy the link for each team member.</li>
                    <li>Share the invite link and ask them to redeem!</li>
                  </ol>
                )}
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

'use client';

import { AlertCircle, Check, Copy, UserPlus } from 'lucide-react';
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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAuthClient } from '@/lib/auth-client';

interface InviteMemberDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface InvitationResult {
  email: string;
  status: 'success' | 'error';
  link?: string;
  error?: string;
}

export function InviteMemberDialog({ open, onOpenChange }: InviteMemberDialogProps) {
  const params = useParams();
  const organizationId = params.tenantId as string;
  const authClient = useAuthClient();

  const [emails, setEmails] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [invitationResults, setInvitationResults] = useState<InvitationResult[]>([]);
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null);

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
          role: 'owner',
          organizationId,
        });

        if ('error' in result && result.error) {
          results.push({
            email,
            status: 'error',
            error: result.error.message || 'Failed to create invitation',
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
            error: 'Failed to generate invitation link',
          });
        }
      } catch (err) {
        results.push({
          email,
          status: 'error',
          error: err instanceof Error ? err.message : 'Failed to create invitation',
        });
      }
    }

    setInvitationResults(results);
    setIsSubmitting(false);
  };

  const handleCopyLink = async (link: string, index: number) => {
    try {
      await navigator.clipboard.writeText(link);
      setCopiedIndex(index);
      setTimeout(() => setCopiedIndex(null), 2000);
    } catch {
      setError('Failed to copy to clipboard');
    }
  };

  const handleOpenChange = (newOpen: boolean) => {
    if (!isSubmitting) {
      setEmails('');
      setError(null);
      setInvitationResults([]);
      setCopiedIndex(null);
      onOpenChange(newOpen);
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
            <UserPlus className="h-5 w-5" />
            {hasResults ? 'Invitations Created' : 'Invite Team Members'}
          </DialogTitle>
          <DialogDescription>
            {hasResults
              ? `${successCount} successful, ${errorCount} failed`
              : 'Enter one or more email addresses (comma-separated) to invite members to your organization.'}
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

              <div className="rounded-md bg-muted p-3 text-sm">
                <p className="text-muted-foreground">
                  <span className="font-medium">Role:</span> Member (read-only access)
                </p>
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
                {isSubmitting ? 'Creating...' : 'Create Invitations'}
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
                      {result.status === 'success' && result.link ? (
                        <div className="flex gap-2 mt-2">
                          <Input
                            value={result.link}
                            readOnly
                            className="font-mono text-xs h-8"
                            onClick={(e) => e.currentTarget.select()}
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="icon"
                            onClick={() => handleCopyLink(result.link ?? '', index)}
                            className="shrink-0 h-8 w-8"
                          >
                            {copiedIndex === index ? (
                              <Check className="h-3 w-3 text-green-600" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                          </Button>
                        </div>
                      ) : result.error ? (
                        <p className="text-xs text-red-600 mt-1">{result.error}</p>
                      ) : null}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {successCount > 0 && (
              <div className="rounded-md bg-blue-500/10 p-3 text-sm text-blue-600 dark:text-blue-400">
                <p className="font-medium mb-1">Next Steps:</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>Share the invitation links with the corresponding users</li>
                  <li>They'll sign in or create an account</li>
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

'use client';

import { AlertCircle, Loader2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { Dialog } from '@/components/ui/dialog';
import { LocalDateTimeText } from '@/components/ui/local-date-time-text';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useAuthClient } from '@/contexts/auth-client';
import { useAuthSession } from '@/hooks/use-auth';
import {
  formatNullableField,
  parseDeviceDescriptor,
  type SessionRow,
  sortSessions,
  useRevokeOtherSessionsMutation,
  useRevokeSessionMutation,
  useSessionsQuery,
} from '@/lib/query/sessions';

const COLUMN_COUNT = 6;

function toIso(value: string | Date): string {
  return typeof value === 'string' ? value : value.toISOString();
}

interface SessionTableRowProps {
  session: SessionRow;
  isCurrent: boolean;
  onRevokeClick: (session: SessionRow) => void;
}

function SessionTableRowItem({ session, isCurrent, onRevokeClick }: SessionTableRowProps) {
  const device = parseDeviceDescriptor(session.userAgent);
  const ip = formatNullableField(session.ipAddress);
  const tokenMissing = !session.token;

  useEffect(() => {
    if (tokenMissing) {
      console.warn(
        `[SessionsSection] Session ${session.id} returned without a token; revoke disabled. ` +
          `Check Better Auth listSessions response shape.`
      );
    }
  }, [tokenMissing, session.id]);

  const revokeLabel = isCurrent ? 'Revoke this device and sign out' : `Revoke session: ${device}`;

  const revokeButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => onRevokeClick(session)}
      disabled={tokenMissing}
      aria-label={revokeLabel}
      data-slot="session-revoke-button"
    >
      Revoke
    </Button>
  );

  return (
    <TableRow data-slot="session-row" data-current={isCurrent || undefined} noHover>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{device}</span>
          {isCurrent && <Badge variant="secondary">This device</Badge>}
        </div>
      </TableCell>
      <TableCell>
        <span className="text-sm">{ip}</span>
      </TableCell>
      <TableCell>
        <LocalDateTimeText dateString={toIso(session.createdAt)} />
      </TableCell>
      <TableCell>
        <LocalDateTimeText dateString={toIso(session.updatedAt)} />
      </TableCell>
      <TableCell>
        <LocalDateTimeText dateString={toIso(session.expiresAt)} />
      </TableCell>
      <TableCell className="text-right">
        {tokenMissing ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="inline-block">{revokeButton}</span>
            </TooltipTrigger>
            <TooltipContent>
              This session cannot be revoked from here because its token is unavailable.
            </TooltipContent>
          </Tooltip>
        ) : (
          revokeButton
        )}
      </TableCell>
    </TableRow>
  );
}

type DialogState =
  | { kind: 'revoke'; session: SessionRow }
  | { kind: 'signout'; session: SessionRow }
  | { kind: 'revoke-others' }
  | null;

export function SessionsSection() {
  const { session: currentSession, isLoading: authLoading } = useAuthSession();
  const sessionsQuery = useSessionsQuery({ enabled: !authLoading });
  const { data: sessions = [], isFetching, isError, error, refetch, dataUpdatedAt } = sessionsQuery;

  const authClient = useAuthClient();
  const revokeMutation = useRevokeSessionMutation();
  const revokeOthersMutation = useRevokeOtherSessionsMutation();

  const [dialog, setDialog] = useState<DialogState>(null);
  const [signOutPending, setSignOutPending] = useState(false);
  const [signOutError, setSignOutError] = useState<string | null>(null);

  const hasFetched = dataUpdatedAt > 0;
  const showSkeletons = (authLoading || isFetching) && !hasFetched && !isError;

  const sorted = sortSessions(sessions, currentSession?.id ?? null);
  const otherSessionsCount = sorted.filter((s) => s.id !== currentSession?.id).length;
  const showPanicButton = !showSkeletons && !isError && sorted.length > 1;

  const handleRefetch = () => {
    void refetch();
  };

  const openRevokeDialog = (session: SessionRow) => {
    revokeMutation.reset();
    setSignOutError(null);
    if (session.id === currentSession?.id) {
      setDialog({ kind: 'signout', session });
    } else {
      setDialog({ kind: 'revoke', session });
    }
  };

  const openRevokeOthersDialog = () => {
    revokeOthersMutation.reset();
    setDialog({ kind: 'revoke-others' });
  };

  const closeDialog = () => {
    setDialog(null);
    revokeMutation.reset();
    revokeOthersMutation.reset();
    setSignOutError(null);
  };

  const handleConfirm = async () => {
    if (!dialog) return;
    if (dialog.kind === 'revoke') {
      try {
        await revokeMutation.mutateAsync({ token: dialog.session.token });
        setDialog(null);
      } catch {
        // mutation hook already surfaced toast.error; inline error renders from revokeMutation.error
      }
      return;
    }
    if (dialog.kind === 'revoke-others') {
      try {
        await revokeOthersMutation.mutateAsync();
        setDialog(null);
      } catch {
        // mutation hook already surfaced toast.error; inline error renders from revokeOthersMutation.error
      }
      return;
    }
    setSignOutPending(true);
    setSignOutError(null);
    try {
      await authClient.signOut();
      window.location.href = '/login';
    } catch (err) {
      setSignOutPending(false);
      const message = err instanceof Error ? err.message : 'Failed to sign out';
      setSignOutError(message);
      toast.error(message);
    }
  };

  const dialogIsSignOut = dialog?.kind === 'signout';
  const dialogIsRevokeOthers = dialog?.kind === 'revoke-others';
  const dialogDevice =
    dialog && (dialog.kind === 'revoke' || dialog.kind === 'signout')
      ? parseDeviceDescriptor(dialog.session.userAgent)
      : '';
  const dialogTitle = dialogIsSignOut
    ? 'Revoke this device?'
    : dialogIsRevokeOthers
      ? 'Revoke all other sessions?'
      : 'Revoke session?';
  const dialogDescription = dialogIsSignOut
    ? `This will sign you out of this device (${dialogDevice}).`
    : dialogIsRevokeOthers
      ? `Revoke ${otherSessionsCount} other session(s)? This will sign all other devices out.`
      : `Revoke this session? (${dialogDevice})`;
  const dialogSubmitting = dialogIsSignOut
    ? signOutPending
    : dialogIsRevokeOthers
      ? revokeOthersMutation.isPending
      : revokeMutation.isPending;
  const dialogError = dialogIsSignOut
    ? signOutError
    : dialogIsRevokeOthers
      ? (revokeOthersMutation.isError && revokeOthersMutation.error?.message) || null
      : (revokeMutation.isError && revokeMutation.error?.message) || null;

  return (
    <section data-slot="sessions-section" className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="text-base font-medium">Active sessions</h3>
          <p className="text-muted-foreground text-sm font-normal">
            Devices currently signed in to your account
          </p>
        </div>
        {showPanicButton && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={openRevokeOthersDialog}
            disabled={revokeOthersMutation.isPending}
            data-slot="revoke-others-button"
            className="shrink-0"
          >
            {revokeOthersMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              'Revoke all other sessions'
            )}
          </Button>
        )}
      </div>

      {isError ? (
        <div
          data-slot="sessions-error"
          className="flex flex-col items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-4"
        >
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4" />
            <span>{error?.message ?? 'Failed to load sessions'}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleRefetch} disabled={isFetching}>
            {isFetching ? <Loader2 className="size-4 animate-spin" /> : 'Retry'}
          </Button>
        </div>
      ) : (
        <TooltipProvider delayDuration={200}>
          <div className="rounded-lg border">
            <Table data-slot="sessions-list">
              <TableHeader>
                <TableRow noHover>
                  <TableHead>Name</TableHead>
                  <TableHead>IP</TableHead>
                  <TableHead>Signed in</TableHead>
                  <TableHead>Last active</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {showSkeletons ? (
                  [0, 1, 2].map((i) => (
                    <TableRow key={i} data-slot="sessions-loading-row" noHover>
                      <TableCell colSpan={COLUMN_COUNT}>
                        <Skeleton className="h-6 w-full" />
                      </TableCell>
                    </TableRow>
                  ))
                ) : sorted.length === 0 ? (
                  <TableRow data-slot="sessions-empty" noHover>
                    <TableCell
                      colSpan={COLUMN_COUNT}
                      className="text-center text-sm text-muted-foreground"
                    >
                      No active sessions.
                    </TableCell>
                  </TableRow>
                ) : (
                  sorted.map((session) => (
                    <SessionTableRowItem
                      key={session.id}
                      session={session}
                      isCurrent={session.id === currentSession?.id}
                      onRevokeClick={openRevokeDialog}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </TooltipProvider>
      )}

      <Dialog open={dialog !== null} onOpenChange={(open) => !open && closeDialog()}>
        {dialog && (
          <DeleteConfirmation
            customTitle={dialogTitle}
            customDescription={dialogDescription}
            isSubmitting={dialogSubmitting}
            onDelete={handleConfirm}
          >
            {dialogError && (
              <div
                data-slot="session-dialog-error"
                className="rounded-md bg-destructive/10 p-3 text-sm text-destructive"
              >
                {dialogError}
              </div>
            )}
          </DeleteConfirmation>
        )}
      </Dialog>
    </section>
  );
}

import { Ban, CheckCircle2, Clock, Loader2, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type InvocationStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export const INVOCATION_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'pending', label: 'Pending' },
  { value: 'running', label: 'Running' },
  { value: 'completed', label: 'Completed' },
  { value: 'failed', label: 'Failed' },
  { value: 'cancelled', label: 'Cancelled' },
];

export function getInvocationStatusBadge(status: InvocationStatus) {
  switch (status) {
    case 'pending':
      return (
        <Badge variant="sky" className="gap-1 uppercase">
          <Clock className="w-3 h-3" />
          Pending
        </Badge>
      );
    case 'running':
      return (
        <Badge variant="violet" className="gap-1 uppercase">
          <Loader2 className="w-3 h-3 animate-spin" />
          Running
        </Badge>
      );
    case 'completed':
      return (
        <Badge variant="primary" className="gap-1 uppercase">
          <CheckCircle2 className="w-3 h-3" />
          Completed
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="error" className="gap-1 uppercase">
          <XCircle className="w-3 h-3" />
          Failed
        </Badge>
      );
    case 'cancelled':
      return (
        <Badge variant="code" className="gap-1 uppercase">
          <Ban className="w-3 h-3" />
          Cancelled
        </Badge>
      );
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

export function formatInvocationDateTime(dateString: string | null): string {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleString();
}

export function formatInvocationDuration(
  startedAt: string | null,
  completedAt: string | null
): string {
  if (!startedAt || !completedAt) return '—';
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  const durationMs = end - start;

  if (durationMs < 1000) return `${durationMs}ms`;
  if (durationMs < 60000) return `${(durationMs / 1000).toFixed(1)}s`;
  return `${(durationMs / 60000).toFixed(1)}m`;
}

'use client';

import { Check, Eye, Loader2, X, XCircle } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { mergeImprovementAction, rejectImprovementAction } from '@/lib/actions/improvements';
import type { ImprovementRun } from '@/lib/api/improvements';
import { formatDateTimeTable } from '@/lib/utils/format-date';

interface ImprovementsTableProps {
  tenantId: string;
  projectId: string;
  improvements: ImprovementRun[];
}

export function ImprovementsTable({ tenantId, projectId, improvements }: ImprovementsTableProps) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  const handleMerge = (branchName: string) => {
    setLoadingAction(`merge-${branchName}`);
    mergeImprovementAction(tenantId, projectId, branchName)
      .then((result) => {
        if (result.success) {
          toast.success('Improvement merged successfully');
          router.refresh();
        } else if (result.code === 'conflict') {
          toast.warning('Merge conflicts detected — resolve them in the diff view');
          router.push(
            `/${tenantId}/projects/${projectId}/improvements/${encodeURIComponent(branchName)}`
          );
        } else {
          toast.error(result.error ?? 'Failed to merge improvement');
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to merge improvement');
      })
      .then(() => setLoadingAction(null));
  };

  const handleReject = (branchName: string) => {
    setLoadingAction(`reject-${branchName}`);
    rejectImprovementAction(tenantId, projectId, branchName)
      .then((result) => {
        if (result.success) {
          toast.success('Improvement rejected');
          router.refresh();
        } else {
          toast.error(result.error ?? 'Failed to reject improvement');
        }
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to reject improvement');
      })
      .then(() => setLoadingAction(null));
  };

  if (improvements.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        <p className="text-lg font-medium">No improvement proposals yet</p>
        <p className="text-sm mt-1">
          Improvements will appear here when the improvement agent creates proposals based on
          feedback.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Branch</TableHead>
          <TableHead>Created</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="text-right">Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {improvements.map((improvement) => {
          const diffHref = `/${tenantId}/projects/${projectId}/improvements/${encodeURIComponent(improvement.branchName)}`;
          return (
            <TableRow key={improvement.branchName} className="cursor-pointer hover:bg-muted/50">
              <TableCell className="font-mono text-xs">
                <Link href={diffHref} className="hover:underline">
                  {improvement.branchName}
                </Link>
              </TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {improvement.createdAt
                  ? formatDateTimeTable(improvement.createdAt, { local: true })
                  : '—'}
              </TableCell>
              <TableCell>
                {improvement.status === 'running' && (
                  <Badge variant="secondary" className="gap-1.5">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Running
                  </Badge>
                )}
                {improvement.status === 'completed' && (
                  <Badge variant="default" className="gap-1.5">
                    <Check className="h-3 w-3" />
                    Completed
                  </Badge>
                )}
                {improvement.status === 'failed' && (
                  <Badge variant="destructive" className="gap-1.5">
                    <XCircle className="h-3 w-3" />
                    Failed
                  </Badge>
                )}
                {!improvement.status && <Badge variant="outline">Ready for review</Badge>}
              </TableCell>
              <TableCell className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button size="sm" variant="ghost" asChild>
                    <Link href={diffHref}>
                      <Eye className="h-4 w-4" />
                      <span className="ml-1">Diff</span>
                    </Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleMerge(improvement.branchName)}
                    disabled={loadingAction !== null}
                  >
                    {loadingAction === `merge-${improvement.branchName}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    <span className="ml-1">Merge</span>
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => handleReject(improvement.branchName)}
                    disabled={loadingAction !== null}
                  >
                    {loadingAction === `reject-${improvement.branchName}` ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <X className="h-4 w-4" />
                    )}
                    <span className="ml-1">Reject</span>
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

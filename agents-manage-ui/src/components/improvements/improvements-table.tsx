'use client';

import { Check, Eye, Loader2, X } from 'lucide-react';
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
import type { ImprovementRun } from '@/lib/api/improvements';
import { mergeImprovement, rejectImprovement } from '@/lib/api/improvements';

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
    mergeImprovement(tenantId, projectId, branchName)
      .then(() => {
        toast.success('Improvement merged successfully');
        router.refresh();
      })
      .catch((error) => {
        toast.error(error instanceof Error ? error.message : 'Failed to merge improvement');
      })
      .then(() => setLoadingAction(null));
  };

  const handleReject = (branchName: string) => {
    setLoadingAction(`reject-${branchName}`);
    rejectImprovement(tenantId, projectId, branchName)
      .then(() => {
        toast.success('Improvement rejected');
        router.refresh();
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
          <TableHead>Agent</TableHead>
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
              <TableCell>{improvement.agentId || 'All agents'}</TableCell>
              <TableCell className="text-muted-foreground text-sm">
                {improvement.timestamp
                  ? new Date(improvement.timestamp).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      year: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                      hour12: true,
                    })
                  : '—'}
              </TableCell>
              <TableCell>
                <Badge variant="outline">Ready for review</Badge>
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

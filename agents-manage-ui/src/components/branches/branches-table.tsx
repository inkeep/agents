'use client';

import { Eye, GitBranch, GitMerge, MoreHorizontal, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import EmptyState from '@/components/layout/empty-state';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { Branch } from '@/lib/api/branches';
import { DeleteBranchConfirmation, MergeBranchConfirmation } from './branch-actions';
import { BranchDiffDialog } from './branch-diff-dialog';

interface BranchesTableProps {
  tenantId: string;
  projectId: string;
  branches: Branch[];
  branchHasChanges?: Record<string, boolean>;
}

export function BranchesTable({ tenantId, projectId, branches, branchHasChanges }: BranchesTableProps) {
  const router = useRouter();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [diffTarget, setDiffTarget] = useState<string | null>(null);

  const nonMainBranches = branches.filter((b) => b.baseName !== 'main');

  if (nonMainBranches.length === 0) {
    return (
      <EmptyState
        title="No branches"
        description="Branches are created automatically when you use the feedback improvement agent, or you can create them via the API."
        icon={<GitBranch className="size-16 text-muted-foreground/50" />}
      />
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <GitBranch className="size-4" />
            {nonMainBranches.length} {nonMainBranches.length === 1 ? 'branch' : 'branches'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-[80px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {nonMainBranches.map((branch) => (
                <TableRow key={branch.baseName}>
                  <TableCell className="font-mono text-sm">{branch.baseName}</TableCell>
                  <TableCell>
                    {branchHasChanges?.[branch.baseName] ? (
                      <Badge variant="success">Has changes</Badge>
                    ) : (
                      <Badge variant="outline">No changes</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setDiffTarget(branch.baseName)}>
                          <Eye className="size-4 mr-2" />
                          View diff
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setMergeTarget(branch.baseName)}>
                          <GitMerge className="size-4 mr-2" />
                          Merge into main
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => setDeleteTarget(branch.baseName)}
                          className="text-destructive focus:text-destructive"
                        >
                          <Trash2 className="size-4 mr-2" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {deleteTarget && (
        <DeleteBranchConfirmation
          tenantId={tenantId}
          projectId={projectId}
          branchName={deleteTarget}
          isOpen={!!deleteTarget}
          onOpenChange={(open) => !open && setDeleteTarget(null)}
          onDeleted={() => router.refresh()}
        />
      )}

      {mergeTarget && (
        <MergeBranchConfirmation
          tenantId={tenantId}
          projectId={projectId}
          branchName={mergeTarget}
          isOpen={!!mergeTarget}
          onOpenChange={(open) => !open && setMergeTarget(null)}
          onMerged={() => router.refresh()}
        />
      )}

      {diffTarget && (
        <BranchDiffDialog
          tenantId={tenantId}
          projectId={projectId}
          branchName={diffTarget}
          isOpen={!!diffTarget}
          onOpenChange={(open) => !open && setDiffTarget(null)}
        />
      )}
    </>
  );
}

'use client';

import { ChevronsUpDown, GitBranch, Plus } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { Branch } from '@/lib/api/branches';
import { fetchBranches } from '@/lib/api/branches';
import { Button } from '../ui/button';
import type { OptionType } from '../ui/combobox';
import { Combobox } from '../ui/combobox';
import { PopoverTrigger } from '../ui/popover';
import { Skeleton } from '../ui/skeleton';
import { NewBranchDialog } from './new-branch-dialog';

interface BranchSelectorProps {
  tenantId: string;
  projectId: string;
}

export function BranchSelector({ tenantId, projectId }: BranchSelectorProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  // Get current branch from URL params (just the base name, not the full namespaced name)
  // The ref parameter is used by the API middleware to determine which branch to use
  // If no ref is specified, defaults to 'main'
  const currentBranch = searchParams.get('ref') || 'main';

  useEffect(() => {
    loadBranches();
  }, [tenantId, projectId]);

  async function loadBranches() {
    try {
      setLoading(true);
      const response = await fetchBranches(tenantId, projectId);
      setBranches(response.data);
    } catch (error) {
      console.error('Failed to fetch branches:', error);
      toast.error('Failed to load branches');
    } finally {
      setLoading(false);
    }
  }

  const handleBranchChange = (branchName: string) => {
    if (branchName === '__create_new__') {
      setCreateDialogOpen(true);
      return;
    }

    startTransition(() => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('ref', branchName);
      router.push(`?${params.toString()}`);
      router.refresh(); // Refresh server components with new ref
    });
  };

  const handleBranchCreated = () => {
    loadBranches();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2">
        <GitBranch className="h-4 w-4 text-muted-foreground" />
        <Skeleton className="h-9 w-[200px]" />
      </div>
    );
  }

  const options: OptionType[] = [
    ...branches.map((branch) => ({
      value: branch.baseName,
      label: <span className="font-medium">{branch.baseName}</span>,
    })),
    {
      value: '__create_new__',
      label: (
        <div className="flex items-center gap-2 text-primary">
          <Plus className="h-4 w-4" />
          <span className="font-medium">Create new branch</span>
        </div>
      ),
    },
  ];

  return (
    <div className="flex items-center gap-2">
      <GitBranch className="h-4 w-4 text-muted-foreground" />
      <Combobox
        key={currentBranch} // Force re-render when branch changes
        options={options}
        onSelect={handleBranchChange}
        defaultValue={currentBranch}
        placeholder="Select branch"
        searchPlaceholder="Search branches..."
        className="w-auto"
        TriggerComponent={
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              className="h-9 w-auto min-w-[120px] max-w-[200px] justify-between px-3"
            >
              <span className="truncate">{currentBranch}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
        }
      />
      <NewBranchDialog
        tenantId={tenantId}
        projectId={projectId}
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSuccess={handleBranchCreated}
        availableBranches={branches.map((b) => b.baseName)}
      />
    </div>
  );
}

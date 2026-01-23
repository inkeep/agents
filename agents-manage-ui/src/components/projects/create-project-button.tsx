'use client';

import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIsOrgAdmin } from '@/hooks/use-is-org-admin';
import { NewProjectDialog } from './new-project-dialog';

interface CreateProjectButtonProps {
  tenantId: string;
  size?: 'default' | 'lg';
  label?: string;
}

export function CreateProjectButton({
  tenantId,
  size = 'default',
  label = 'Create project',
}: CreateProjectButtonProps) {
  const { isAdmin, isLoading } = useIsOrgAdmin();

  // Don't render anything while checking permissions or if not allowed
  if (isLoading || !isAdmin) {
    return null;
  }

  return (
    <NewProjectDialog tenantId={tenantId}>
      <Button size={size}>
        <Plus />
        {label}
      </Button>
    </NewProjectDialog>
  );
}

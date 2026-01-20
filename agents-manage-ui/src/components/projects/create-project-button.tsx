'use client';

import { OrgRoles } from '@inkeep/agents-core/client-exports';
import { Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useAuthClient } from '@/contexts/auth-client';
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
  const authClient = useAuthClient();
  const [canCreate, setCanCreate] = useState<boolean | null>(null);

  useEffect(() => {
    async function checkPermission() {
      try {
        const memberResult = await authClient.organization.getActiveMember();
        if (memberResult.data) {
          const role = memberResult.data.role;
          // Only owners and admins can create projects
          setCanCreate(role === OrgRoles.OWNER || role === OrgRoles.ADMIN);
        } else {
          setCanCreate(false);
        }
      } catch {
        setCanCreate(false);
      }
    }
    checkPermission();
  }, [authClient]);

  // Don't render anything while checking permissions or if not allowed
  if (canCreate === null || !canCreate) {
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

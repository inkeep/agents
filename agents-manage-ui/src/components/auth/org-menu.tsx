'use client';

import { Building2, Settings } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuthSession } from '@/hooks/use-auth';
import { useAuthClient } from '@/lib/auth-client';

export function OrgMenu() {
  const { user, isLoading } = useAuthSession();
  const authClient = useAuthClient();
  const router = useRouter();
  const { tenantId } = useParams<{ tenantId: string }>();
  const [organizationName, setOrganizationName] = useState<string | null>(null);

  useEffect(() => {
    async function fetchOrganization() {
      if (!tenantId) return;

      try {
        const result = await authClient.organization.getFullOrganization({
          query: {
            organizationId: tenantId,
          },
        });

        if (result?.data?.name) {
          setOrganizationName(result.data.name);
        }
      } catch (error) {
        console.error('Failed to fetch organization:', error);
      }
    }

    fetchOrganization();
  }, [tenantId, authClient]);

  if (isLoading || !user || !tenantId) {
    return null;
  }

  const handleSettings = () => {
    router.push(`/${tenantId}/settings`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-2 px-2 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground text-sidebar-foreground/80 dark:text-sidebar-foreground normal-case"
        >
          <Building2 className="h-4 w-4" />
          <span className="text-xs font-medium normal-case">{organizationName ?? ''}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-xs text-muted-foreground">{organizationName || ''}</p>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={handleSettings} className="gap-2">
          <Settings className="h-4 w-4" />
          Settings
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

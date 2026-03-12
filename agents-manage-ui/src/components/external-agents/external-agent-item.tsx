'use client';

import { MoreVertical, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogTrigger } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ItemCardContent,
  ItemCardFooter,
  ItemCardHeader,
  ItemCardLink,
  ItemCardRoot,
  ItemCardTitle,
} from '@/components/ui/item-card';
import { URLDisplay } from '@/components/url-display';
import { useProjectPermissions } from '@/contexts/project';
import type { ExternalAgent } from '@/lib/types/external-agents';
import { formatDate } from '@/lib/utils/format-date';
import { ProviderIcon } from '../icons/provider-icon';
import { Badge } from '../ui/badge';
import { DeleteExternalAgentConfirmation } from './delete-external-agent-confirmation';

interface ExternalAgentDialogMenuProps {
  externalAgentId: string;
  externalAgentName?: string;
}

function ExternalAgentDialogMenu({
  externalAgentId,
  externalAgentName,
}: ExternalAgentDialogMenuProps) {
  const [isOpen, setIsOpen] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            className=" p-0 hover:bg-accent hover:text-accent-foreground rounded-sm -mr-2"
          >
            <MoreVertical className="h-4 w-4 text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          className="w-48 shadow-lg border border-border bg-popover/95 backdrop-blur-sm"
        >
          <DialogTrigger asChild>
            <DropdownMenuItem variant="destructive">
              <Trash2 />
              Delete
            </DropdownMenuItem>
          </DialogTrigger>
        </DropdownMenuContent>
      </DropdownMenu>
      {isOpen && (
        <DeleteExternalAgentConfirmation
          externalAgentId={externalAgentId}
          externalAgentName={externalAgentName}
          setIsOpen={setIsOpen}
        />
      )}
    </Dialog>
  );
}

export function ExternalAgentItem({
  tenantId,
  projectId,
  externalAgent,
}: {
  tenantId: string;
  projectId: string;
  externalAgent: ExternalAgent;
}) {
  const { canEdit } = useProjectPermissions();
  const linkPath = `/${tenantId}/projects/${projectId}/external-agents/${externalAgent.id}`;

  return (
    <ItemCardRoot>
      <ItemCardHeader>
        <ItemCardLink href={linkPath} className="min-w-0">
          <ItemCardTitle className="text-md flex items-center gap-3 min-w-0">
            <ProviderIcon provider={externalAgent.name} size={24} className="flex-shrink-0" />
            <span className="font-medium break-all">{externalAgent.name}</span>
          </ItemCardTitle>
        </ItemCardLink>
        {canEdit && (
          <ExternalAgentDialogMenu
            externalAgentId={externalAgent.id}
            externalAgentName={externalAgent.name}
          />
        )}
      </ItemCardHeader>
      <ItemCardContent>
        <div className="space-y-3 min-w-0">
          {externalAgent.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {externalAgent.description}
            </p>
          )}

          <URLDisplay>{externalAgent.baseUrl}</URLDisplay>

          {/* Key metrics in a structured layout */}
          <div className="flex items-center gap-2 flex-wrap">
            {externalAgent.credentialReferenceId && (
              <Badge className="uppercase" variant="primary">
                Secured
              </Badge>
            )}
          </div>
        </div>
        <ItemCardFooter footerText={`Created ${formatDate(externalAgent.createdAt)}`} />
      </ItemCardContent>
    </ItemCardRoot>
  );
}

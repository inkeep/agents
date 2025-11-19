'use client';

import { MoreVertical, Trash2 } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { formatDate } from '@/app/utils/format-date';
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
import { useCurrentRef } from '@/hooks/use-current-ref';
import { deleteExternalAgentAction } from '@/lib/actions/external-agents';
import type { ExternalAgent } from '@/lib/types/external-agents';
import { ProviderIcon } from '../icons/provider-icon';
import { Badge } from '../ui/badge';
import { DeleteConfirmation } from '../ui/delete-confirmation';
import { Tooltip, TooltipContent, TooltipTrigger } from '../ui/tooltip';

// URL Display Component with ellipsis and tooltip
function URLDisplay({ url }: { url: string }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="rounded py-1 min-w-0">
          <code className="text-sm text-muted-foreground block truncate">{url}</code>
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" align="start" className="max-w-md">
        <code className="text-xs break-all">{url}</code>
      </TooltipContent>
    </Tooltip>
  );
}

interface ExternalAgentDialogMenuProps {
  externalAgentId: string;
  externalAgentName?: string;
}

function ExternalAgentDialogMenu({
  externalAgentId,
  externalAgentName,
}: ExternalAgentDialogMenuProps) {
  const { tenantId, projectId } = useParams<{
    tenantId: string;
    projectId: string;
  }>();
  const ref = useCurrentRef();

  const [isOpen, setIsOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
  };

  const handleDelete = async () => {
    setIsSubmitting(true);
    try {
      const result = await deleteExternalAgentAction(tenantId, projectId, externalAgentId, ref);
      if (result.success) {
        setIsOpen(false);
        toast.success('External agent deleted.');
      } else {
        toast.error('Failed to delete external agent.');
      }
    } finally {
      setIsSubmitting(false);
    }
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
            <DropdownMenuItem className="text-destructive hover:!bg-destructive/10 dark:hover:!bg-destructive/20 hover:!text-destructive cursor-pointer">
              <Trash2 className="size-4 text-destructive" />
              Delete
            </DropdownMenuItem>
          </DialogTrigger>
        </DropdownMenuContent>
      </DropdownMenu>
      {isOpen && (
        <DeleteConfirmation
          itemName={externalAgentName || 'this external agent'}
          isSubmitting={isSubmitting}
          onDelete={handleDelete}
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
  const linkPath = `/${tenantId}/projects/${projectId}/external-agents/${externalAgent.id}`;

  return (
    <ItemCardRoot>
      <ItemCardHeader>
        <ItemCardLink href={linkPath} className="min-w-0">
          <ItemCardTitle className="text-md flex items-center gap-3 min-w-0">
            <ProviderIcon provider={externalAgent.name} size={24} className="flex-shrink-0" />
            <span className="flex-1 min-w-0 text-base font-medium truncate">
              {externalAgent.name}
            </span>
          </ItemCardTitle>
        </ItemCardLink>
        <ExternalAgentDialogMenu
          externalAgentId={externalAgent.id}
          externalAgentName={externalAgent.name}
        />
      </ItemCardHeader>
      <ItemCardContent>
        <div className="space-y-3 min-w-0">
          {externalAgent.description && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {externalAgent.description}
            </p>
          )}

          <URLDisplay url={externalAgent.baseUrl} />

          {/* Key metrics in a structured layout */}
          <div className="flex items-center gap-2 flex-wrap">
            {externalAgent.credentialReferenceId && <Badge variant="code">Secured</Badge>}
          </div>
        </div>
        <ItemCardFooter footerText={`Created ${formatDate(externalAgent.createdAt)}`} />
      </ItemCardContent>
    </ItemCardRoot>
  );
}

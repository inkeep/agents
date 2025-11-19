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
import { deleteCredentialAction } from '@/lib/actions/credentials';
import type { Credential } from '@/lib/api/credentials';
import { ProviderIcon } from '../icons/provider-icon';
import { DeleteConfirmation } from '../ui/delete-confirmation';

interface CredentialDialogMenuProps {
  credentialId: string;
  credentialName?: string;
}

function CredentialDialogMenu({ credentialId, credentialName }: CredentialDialogMenuProps) {
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
      const result = await deleteCredentialAction(tenantId, projectId, credentialId, ref);
      if (result.success) {
        setIsOpen(false);
        toast.success('Credential deleted.');
      } else {
        toast.error(result.error);
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
          itemName={credentialName || 'this credential'}
          isSubmitting={isSubmitting}
          onDelete={handleDelete}
        />
      )}
    </Dialog>
  );
}

export function CredentialItem({
  id,
  name,
  createdAt,
  tenantId,
  projectId,
}: {
  id: Credential['id'];
  name: Credential['name'];
  createdAt: Credential['createdAt'];
  tenantId: string;
  projectId: string;
}) {
  const linkPath = `/${tenantId}/projects/${projectId}/credentials/${id}`;

  return (
    <ItemCardRoot>
      <ItemCardHeader>
        <ItemCardLink href={linkPath} className="min-w-0">
          <ItemCardTitle className="text-md flex items-center gap-3 min-w-0">
            <ProviderIcon provider={name} size={24} className="flex-shrink-0" />
            <span className="flex-1 min-w-0 truncate">{name}</span>
          </ItemCardTitle>
        </ItemCardLink>
        <CredentialDialogMenu credentialId={id} credentialName={name} />
      </ItemCardHeader>
      <ItemCardContent>
        {/* <ItemCardDescription hasContent={!!description} className="line-clamp-2">
            {description || 'No description'}
          </ItemCardDescription> */}
        <ItemCardFooter footerText={`Created ${formatDate(createdAt)}`} />
      </ItemCardContent>
    </ItemCardRoot>
  );
}

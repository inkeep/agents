'use client';

import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { ApiKey } from '@/lib/api/api-keys';
import { DeleteApiKeyConfirmation } from './delete-api-key-confirmation';
import { ApiKeyUpdateDialog } from './update-api-key-dialog';

interface ApiKeyItemMenuProps {
  apiKey: ApiKey;
}

type DialogType = 'delete' | 'update' | null;

export function ApiKeyItemMenu({ apiKey }: ApiKeyItemMenuProps) {
  const [openDialog, setOpenDialog] = useState<DialogType>(null);

  const handleDialogClose = () => {
    setOpenDialog(null);
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
            <span className="sr-only">Open menu</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem className=" cursor-pointer" onClick={() => setOpenDialog('update')}>
            <Pencil className="size-4" />
            Edit
          </DropdownMenuItem>
          <DropdownMenuItem
            className="text-destructive hover:!bg-destructive/10 dark:hover:!bg-destructive/20 hover:!text-destructive cursor-pointer"
            onClick={() => setOpenDialog('delete')}
          >
            <Trash2 className="size-4 text-destructive" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {openDialog === 'delete' && (
        <DeleteApiKeyConfirmation
          apiKeyId={apiKey.id}
          apiKeyName={apiKey.name || 'No name'}
          setIsOpen={handleDialogClose}
        />
      )}

      {openDialog === 'update' && (
        <ApiKeyUpdateDialog apiKey={apiKey} setIsOpen={handleDialogClose} />
      )}
    </>
  );
}

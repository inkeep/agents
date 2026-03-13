'use client';

import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { SelectOption } from '@/components/form/generic-select';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { App } from '@/lib/api/apps';
import { DeleteAppConfirmation } from './delete-app-confirmation';
import { UpdateAppDialog } from './update-app-dialog';

interface AppItemMenuProps {
  app: App;
  agentOptions: SelectOption[];
}

type DialogType = 'delete' | 'update' | null;

export function AppItemMenu({ app, agentOptions }: AppItemMenuProps) {
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
          <DropdownMenuItem className="cursor-pointer" onClick={() => setOpenDialog('update')}>
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
        <DeleteAppConfirmation appId={app.id} appName={app.name} setIsOpen={handleDialogClose} />
      )}

      {openDialog === 'update' && (
        <UpdateAppDialog app={app} agentOptions={agentOptions} setIsOpen={handleDialogClose} />
      )}
    </>
  );
}

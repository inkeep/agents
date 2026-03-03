'use client';

import { MoreHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import type { App } from '@/lib/api/apps';
import { DeleteAppConfirmation } from './delete-app-confirmation';

interface AppItemMenuProps {
  app: App;
}

export function AppItemMenu({ app }: AppItemMenuProps) {
  const [showDelete, setShowDelete] = useState(false);

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
          <DropdownMenuItem
            className="text-destructive hover:!bg-destructive/10 dark:hover:!bg-destructive/20 hover:!text-destructive cursor-pointer"
            onClick={() => setShowDelete(true)}
          >
            <Trash2 className="size-4 text-destructive" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showDelete && (
        <DeleteAppConfirmation
          appId={app.id}
          appName={app.name}
          setIsOpen={() => setShowDelete(false)}
        />
      )}
    </>
  );
}

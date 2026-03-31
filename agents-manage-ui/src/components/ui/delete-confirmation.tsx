import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogTitle,
} from '@/components/ui/dialog';

interface DeleteConfirmationProps {
  itemName?: string;
  isSubmitting: boolean;
  onDelete: () => Promise<void> | void;
  customTitle?: string;
  customDescription?: string;
  children?: ReactNode;
}

export function DeleteConfirmation({
  itemName = 'this item',
  isSubmitting,
  onDelete,
  customTitle = `Delete ${itemName}`,
  customDescription = `Are you sure you want to delete ${itemName}? This action cannot be undone.`,
  children,
}: DeleteConfirmationProps) {
  return (
    <DialogContent>
      <DialogTitle>{customTitle}</DialogTitle>
      <DialogDescription
        // respect \n in message
        className="whitespace-pre-wrap"
      >
        {customDescription}
      </DialogDescription>
      {children}
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button variant="destructive" onClick={onDelete} disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Deleting...
            </>
          ) : (
            'Delete'
          )}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

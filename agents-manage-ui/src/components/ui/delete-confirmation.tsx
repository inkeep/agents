import { Loader2 } from 'lucide-react';
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
  onDelete: () => Promise<void>;
  customTitle?: string;
  customDescription?: string;
}

export function DeleteConfirmation({
  itemName,
  isSubmitting,
  onDelete,
  customTitle,
  customDescription,
}: DeleteConfirmationProps) {
  const handleDelete = async () => {
    await onDelete();
  };

  return (
    <DialogContent>
      <DialogTitle>{customTitle || `Delete ${itemName || 'this item'}`}</DialogTitle>
      <DialogDescription>
        {customDescription ||
          `Are you sure you want to delete ${itemName || 'this item'}? This action cannot be undone.`}
      </DialogDescription>
      <DialogFooter>
        <DialogClose asChild>
          <Button variant="outline">Cancel</Button>
        </DialogClose>
        <Button variant="destructive" onClick={handleDelete} disabled={isSubmitting}>
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

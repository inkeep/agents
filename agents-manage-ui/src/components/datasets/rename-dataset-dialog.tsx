'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { GenericInput } from '@/components/form/generic-input';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';
import { updateDatasetAction } from '@/lib/actions/datasets';
import { toast } from '@/lib/toast';

const renameSchema = z.object({
  name: z.string().min(1, 'Name is required'),
});

type RenameFormData = z.infer<typeof renameSchema>;

interface RenameDatasetDialogProps {
  tenantId: string;
  projectId: string;
  datasetId: string;
  currentName: string;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RenameDatasetDialog({
  tenantId,
  projectId,
  datasetId,
  currentName,
  isOpen,
  onOpenChange,
}: RenameDatasetDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<RenameFormData>({
    resolver: zodResolver(renameSchema),
    defaultValues: {
      name: currentName,
    },
  });

  const onSubmit = async (data: RenameFormData) => {
    setIsSubmitting(true);
    try {
      const result = await updateDatasetAction(tenantId, projectId, datasetId, {
        name: data.name,
      });
      if (result.success) {
        toast.success('Test suite renamed');
        onOpenChange(false);
      } else {
        toast.error(result.error || 'Failed to rename test suite');
      }
    } catch (error) {
      console.error('Error renaming dataset:', error);
      toast.error('An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rename Test Suite</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <GenericInput
              control={form.control}
              name="name"
              label="Name"
              placeholder="Test Suite"
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Renaming...' : 'Rename'}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

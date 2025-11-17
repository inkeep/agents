'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { createBranch } from '@/lib/api/branches';

const branchSchema = z.object({
  name: z
    .string()
    .min(1, 'Branch name is required')
    .regex(
      /^[a-zA-Z0-9_\-/]+$/,
      'Branch name can only contain letters, numbers, underscores, hyphens, and forward slashes'
    )
    .refine((name) => !name.startsWith('/') && !name.endsWith('/'), {
      message: 'Branch name cannot start or end with a forward slash',
    }),
  from: z.string().optional(),
});

type BranchFormData = z.infer<typeof branchSchema>;

interface NewBranchDialogProps {
  tenantId: string;
  projectId: string;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onSuccess?: () => void;
  availableBranches?: string[];
}

export function NewBranchDialog({
  tenantId,
  projectId,
  open: controlledOpen,
  onOpenChange,
  onSuccess,
  availableBranches = [],
}: NewBranchDialogProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Use controlled state if provided, otherwise use uncontrolled
  const open = controlledOpen !== undefined ? controlledOpen : uncontrolledOpen;
  const setOpen = onOpenChange || setUncontrolledOpen;

  const currentBranch = searchParams.get('ref') || 'main';

  const form = useForm<BranchFormData>({
    resolver: zodResolver(branchSchema),
    defaultValues: {
      name: '',
      from: currentBranch,
    },
  });

  const onSubmit = async (data: BranchFormData) => {
    try {
      setIsSubmitting(true);

      await createBranch(tenantId, projectId, {
        name: data.name,
        from: data.from || undefined,
      });

      toast.success(`Branch "${data.name}" created successfully`);

      // Close dialog first
      setOpen(false);
      form.reset();

      // Switch to the new branch
      const params = new URLSearchParams(searchParams.toString());
      params.set('ref', data.name);
      router.push(`?${params.toString()}`);
      router.refresh(); // Refresh to update server components

      // Reload branches list
      onSuccess?.();
    } catch (error: any) {
      console.error('Failed to create branch:', error);
      const message = error?.message || 'Failed to create branch';
      toast.error(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCancel = () => {
    form.reset();
    setOpen(false);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogTitle>Create new branch</DialogTitle>
        <DialogDescription>
          Create a new branch to work on changes independently. You can branch from any existing
          branch.
        </DialogDescription>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Branch name</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      placeholder="feature/my-new-feature"
                      disabled={isSubmitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Use a descriptive name for your branch (e.g., feature/add-auth,
                    bugfix/login-error)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
            {availableBranches.length > 0 && (
              <FormField
                control={form.control}
                name="from"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Create from branch</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={isSubmitting}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a source branch" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableBranches.map((branch) => (
                          <SelectItem key={branch} value={branch}>
                            {branch}
                            {branch === currentBranch && ' (current)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      The new branch will be created from the selected branch's current state
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? 'Creating...' : 'Create branch'}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

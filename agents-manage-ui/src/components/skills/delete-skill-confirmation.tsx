'use client';

import { useRouter } from 'next/navigation';
import type { FC } from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { deleteSkillAction } from '@/lib/actions/skills';
import { toast } from '@/lib/toast';

interface DeleteSkillConfirmationProps {
  tenantId: string;
  projectId: string;
  skillId: string;
  skillName: string;
  setIsOpen: (open: boolean) => void;
  redirectOnDelete?: boolean;
}

export const DeleteSkillConfirmation: FC<DeleteSkillConfirmationProps> = ({
  tenantId,
  projectId,
  skillId,
  skillName,
  setIsOpen,
  redirectOnDelete = true,
}) => {
  'use memo';
  const router = useRouter();

  const handleDelete = async () => {
    const result = await deleteSkillAction(tenantId, projectId, skillId);
    if (!result.success) {
      toast.error(result.error ?? 'Failed to delete skill');
      return;
    }

    toast.success(`Skill "${skillName}" deleted.`);
    setIsOpen(false);
    if (redirectOnDelete) {
      router.push(`/${tenantId}/projects/${projectId}/skills`);
    }
  };

  return (
    <AlertDialog open onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete skill?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove "{skillName}" skill. Sub-agents referencing this skill will lose the
            association.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDelete} variant="destructive">
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

'use client';

import { useParams, useRouter } from 'next/navigation';
import type { FC, SetStateAction, Dispatch } from 'react';
import { toast } from 'sonner';
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
import { deleteSkill } from '@/lib/api/skills';

interface DeleteSkillConfirmationProps {
  skillId: string;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  redirectOnDelete?: boolean;
}

export const DeleteSkillConfirmation: FC<DeleteSkillConfirmationProps> = ({
  skillId,
  setIsOpen,
}) => {
  'use memo';
  const router = useRouter();
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();

  async function handleDelete() {
    try {
      await deleteSkill(tenantId, projectId, skillId);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete skill');
      return;
    }

    toast.success(`Skill "${skillId}" deleted.`);
    setIsOpen(false);
    router.push(`/${tenantId}/projects/${projectId}/skills`);
  }

  return (
    <AlertDialog open onOpenChange={setIsOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete skill?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove "{skillId}" skill. Sub-agents referencing this skill will lose the
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

'use client';

import { AlertTriangle } from 'lucide-react';
import { useParams, useRouter } from 'next/navigation';
import { type Dispatch, type FC, type SetStateAction, useTransition } from 'react';
import { toast } from 'sonner';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { Dialog } from '@/components/ui/dialog';
import { deleteSkill } from '@/lib/api/skills';

interface DeleteSkillConfirmationProps {
  skillId: string;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
  /** @default true */
  redirectOnDelete?: boolean;
}

export const DeleteSkillConfirmation: FC<DeleteSkillConfirmationProps> = ({
  skillId,
  setIsOpen,
  redirectOnDelete = true,
}) => {
  const router = useRouter();
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const [isSubmitting, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      try {
        await deleteSkill(tenantId, projectId, skillId);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to delete skill');
        return;
      }

      toast.success(`Skill "${skillId}" deleted.`);
      setIsOpen(false);
      if (redirectOnDelete) {
        router.push(`/${tenantId}/projects/${projectId}/skills`);
      }
    });
  }

  return (
    <Dialog open onOpenChange={setIsOpen}>
      <DeleteConfirmation
        itemName={skillId}
        isSubmitting={isSubmitting}
        onDelete={handleDelete}
        customTitle="Delete skill"
        customDescription={`This will remove "${skillId}" skill.
Sub-agents using this skill will lose access.`}
      >
        <Alert variant="warning">
          <AlertTriangle />
          <AlertTitle>All files in this skill will be permanently deleted.</AlertTitle>
          <AlertDescription>This action cannot be undone.</AlertDescription>
        </Alert>
      </DeleteConfirmation>
    </Dialog>
  );
};

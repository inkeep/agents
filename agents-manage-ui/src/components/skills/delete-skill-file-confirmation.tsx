'use client';

import { useParams, useRouter } from 'next/navigation';
import { type Dispatch, type FC, type SetStateAction, useTransition } from 'react';
import { toast } from 'sonner';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { Dialog } from '@/components/ui/dialog';
import { deleteSkillFileAction } from '@/lib/actions/skill-files';

interface DeleteSkillFileConfirmationProps {
  skillId: string;
  fileId: string;
  filePath: string;
  redirectPath?: string;
  setIsOpen: Dispatch<SetStateAction<boolean>>;
}

export const DeleteSkillFileConfirmation: FC<DeleteSkillFileConfirmationProps> = ({
  skillId,
  fileId,
  filePath,
  redirectPath,
  setIsOpen,
}) => {
  'use memo';
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const router = useRouter();
  const [isSubmitting, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteSkillFileAction(tenantId, projectId, skillId, fileId, filePath);

      if (!result.success) {
        toast.error(result.error ?? 'Failed to remove skill file');
        return;
      }

      toast.success(`Removed ${filePath}`);
      setIsOpen(false);
      if (redirectPath) {
        router.push(redirectPath);
      }
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={setIsOpen}>
      <DeleteConfirmation
        itemName={filePath}
        isSubmitting={isSubmitting}
        onDelete={handleDelete}
        customTitle="Remove file"
        customDescription={`Remove "${filePath}" from this skill? This action cannot be undone.`}
      />
    </Dialog>
  );
};

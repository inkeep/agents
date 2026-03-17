'use client';

import { useRouter } from 'next/navigation';
import { type FC, useState } from 'react';
import { toast } from 'sonner';
import { DeleteConfirmation } from '@/components/ui/delete-confirmation';
import { Dialog } from '@/components/ui/dialog';
import { deleteSkillFileAction } from '@/lib/actions/skill-files';

interface DeleteSkillFileConfirmationProps {
  tenantId: string;
  projectId: string;
  skillId: string;
  filePath: string;
  redirectPath?: string;
  setIsOpen: (open: boolean) => void;
}

export const DeleteSkillFileConfirmation: FC<DeleteSkillFileConfirmationProps> = ({
  tenantId,
  projectId,
  skillId,
  filePath,
  redirectPath,
  setIsOpen,
}) => {
  'use memo';
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleDelete = async () => {
    setIsSubmitting(true);
    const result = await deleteSkillFileAction(tenantId, projectId, skillId, filePath);
    setIsSubmitting(false);

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
  };

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

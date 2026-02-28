'use client';

import { useRouter } from 'next/navigation';
import type { FC } from 'react';
import { SkillForm } from '@/components/skills/form/skill-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface SkillEditModalProps {
  readOnly: boolean;
}

export const SkillEditModal: FC<SkillEditModalProps> = ({ readOnly }) => {
  const router = useRouter();

  return (
    <Dialog open onOpenChange={router.back}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{readOnly ? 'View skill' : 'Edit skill'}</DialogTitle>
          <DialogDescription className="sr-only">
            {readOnly ? 'View skill details.' : 'Edit skill details.'}
          </DialogDescription>
        </DialogHeader>
        <SkillForm onSuccess={router.back} readOnly={readOnly} />
      </DialogContent>
    </Dialog>
  );
};

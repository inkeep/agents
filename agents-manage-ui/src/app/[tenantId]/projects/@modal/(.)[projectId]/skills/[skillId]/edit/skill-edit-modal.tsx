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
import { useProjectPermissionsQuery } from '@/lib/query/projects';

export const SkillEditModal: FC = () => {
  const router = useRouter();
  const {
    data: { canEdit },
  } = useProjectPermissionsQuery();

  return (
    <Dialog open onOpenChange={router.back}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{canEdit ? 'Edit skill' : 'View skill'}</DialogTitle>
          <DialogDescription className="sr-only">
            {canEdit ? 'Edit skill details.' : 'View skill details.'}
          </DialogDescription>
        </DialogHeader>
        <SkillForm onSuccess={router.back} readOnly={!canEdit} />
      </DialogContent>
    </Dialog>
  );
};

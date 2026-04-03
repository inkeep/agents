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

  const title = canEdit ? 'Edit skill' : 'View skill';
  const description = canEdit ? 'Edit skill details.' : 'View skill details.';

  return (
    <Dialog open onOpenChange={router.back}>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription className="sr-only">{description}</DialogDescription>
        </DialogHeader>
        <SkillForm onSuccess={router.back} />
      </DialogContent>
    </Dialog>
  );
};

'use client';

import { useRouter } from 'next/navigation';
import type { FC } from 'react';
import { SkillForm } from '@/components/skills/form/skill-form';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const NewSkillModalPage: FC = () => {
  'use memo'
  const router = useRouter();

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) {
          router.back();
        }
      }}
    >
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Create skill</DialogTitle>
        </DialogHeader>
        <SkillForm onSaved={router.back} />
      </DialogContent>
    </Dialog>
  );
};

export default NewSkillModalPage;

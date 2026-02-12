'use client';

import { useRouter } from 'next/navigation';
import { SkillForm } from '@/components/skills/form/skill-form';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

export default function Page(
  _props: PageProps<'/[tenantId]/projects/[projectId]/skills/[skillId]/edit'>
) {
  'use memo';
  const router = useRouter();

  return (
    <Dialog open onOpenChange={router.back}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit skill</DialogTitle>
          <DialogDescription className="sr-only">Edit skill details.</DialogDescription>
        </DialogHeader>
        <SkillForm onSuccess={router.back} />
      </DialogContent>
    </Dialog>
  );
}

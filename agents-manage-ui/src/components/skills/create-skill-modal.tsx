'use client';

import { useCallback, useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { SkillForm } from './form/skill-form';

export function CreateSkillModal() {
  const [open, setOpen] = useState(false);

  const handleSaved = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2">
          <Plus className="size-4" />
          Create skill
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Create skill</DialogTitle>
        </DialogHeader>
        <SkillForm onSaved={handleSaved} />
      </DialogContent>
    </Dialog>
  );
}

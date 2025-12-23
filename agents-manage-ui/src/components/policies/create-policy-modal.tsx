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
import { PolicyForm } from './form/policy-form';

export function CreatePolicyModal() {
  const [open, setOpen] = useState(false);

  const handleSaved = useCallback(() => {
    setOpen(false);
  }, []);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="flex items-center gap-2">
          <Plus className="size-4" />
          Create policy
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Create policy</DialogTitle>
        </DialogHeader>
        <PolicyForm onSaved={handleSaved} />
      </DialogContent>
    </Dialog>
  );
}

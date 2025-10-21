'use client';

import { Maximize, Minimize } from 'lucide-react';
import type { ReactNode, ComponentProps } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

type DialogProps = Required<ComponentProps<typeof Dialog>>;

interface ExpandableFieldProps {
  name: string;
  label: string;
  className?: string;
  children: ReactNode;
  actions?: ReactNode;
  isRequired?: boolean;
  open: DialogProps['open'];
  onOpenChange: DialogProps['onOpenChange'];
}

export function ExpandableField({
  name,
  label,
  children,
  actions,
  isRequired = false,
  open,
  onOpenChange,
}: ExpandableFieldProps) {
  const IconToUse = open ? Minimize : Maximize;

  const content = (
    <>
      <div className="flex items-center justify-between">
        <Label className="gap-1" htmlFor={name}>
          {label}
          {isRequired && <span className="text-red-500">*</span>}
        </Label>
        {/*{actions && <div className="flex gap-2">{actions}</div>}*/}
      </div>
      <div className={cn('relative', open && 'grow')}>
        {children}
        <div className="bg-background dark:bg-input/30 absolute p-1.5 inset-x-px bottom-px rounded-b-md flex justify-end">
          {actions}
          <DialogTrigger asChild>
            <Button variant="link" size="sm" type="button" className="text-xs rounded-sm h-6">
              <IconToUse className="size-3.5" />
              {open ? 'Minimize' : 'Expand'}
            </Button>
          </DialogTrigger>
        </div>
      </div>
    </>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <div className="space-y-2">{content}</div>

      <DialogContent className="!max-w-none h-screen w-screen max-h-screen p-0 gap-0 border-0 rounded-none">
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className="sr-only">{`${label} Editor`}</DialogDescription>
        <div className="flex flex-col w-full px-8 pb-8 pt-12 mx-auto max-w-7xl min-w-0 gap-2">
          {content}
        </div>
      </DialogContent>
    </Dialog>
  );
}

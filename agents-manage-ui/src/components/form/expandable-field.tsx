'use client';

import { Maximize } from 'lucide-react';
import type { ComponentProps, ReactNode } from 'react';
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
  hasError?: boolean;
}

export function ExpandableField({
  name,
  label,
  children,
  actions,
  isRequired = false,
  open,
  onOpenChange,
  hasError,
}: ExpandableFieldProps) {
  const content = (
    <>
      <div className="flex items-center justify-between">
        <Label className={cn(hasError && 'text-red-600', 'gap-1')} htmlFor={name}>
          {label}
          {isRequired && <span className="text-red-500">*</span>}
        </Label>
        <div className="flex gap-2">
          {actions}
          {!open && (
            <DialogTrigger asChild>
              <Button variant="link" size="sm" type="button" className="text-xs rounded-sm h-6">
                <Maximize className="size-3.5" />
                Expand
              </Button>
            </DialogTrigger>
          )}
        </div>
      </div>
      <div className={cn('relative space-y-2', open && 'grow')}>{children}</div>
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

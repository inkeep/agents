'use client';

import { Maximize } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface ExpandableFieldProps {
  name: string;
  label: string;
  className?: string;
  compactView: ReactNode;
  expandedView: ReactNode;
  actions?: ReactNode;
  isRequired?: boolean;
}

export function ExpandableField({
  name,
  label,
  compactView,
  expandedView,
  actions,
  isRequired = false,
}: ExpandableFieldProps) {
  return (
    <Dialog>
      <div className="space-y-2 relative">
        <div className="flex items-center justify-between">
          <Label className="gap-1" htmlFor={name}>
            {label}
            {isRequired && <span className="text-red-500">*</span>}
          </Label>
          {actions && <div className="flex gap-2">{actions}</div>}
        </div>
        {compactView}
        <DialogTrigger asChild>
          <Button
            variant="unstyled"
            size="sm"
            type="button"
            className="absolute bottom-1 start-4 text-xs rounded-sm h-6"
          >
            <Maximize className="size-2.5" />
            Expand
          </Button>
        </DialogTrigger>
      </div>

      <DialogContent className="!max-w-none h-screen w-screen max-h-screen p-0 gap-0 border-0 rounded-none">
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className="sr-only">{label} Editor</DialogDescription>
        <div className="flex flex-col min-h-0 w-full h-full px-8 pb-8 pt-12 space-y-2 min-w-0 mx-auto max-w-7xl">
          <div className="flex items-center justify-between">
            <Label htmlFor={`${name}-expanded`}>{label}</Label>
            {actions}
          </div>
          <div className="flex-1 min-h-0">{expandedView}</div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

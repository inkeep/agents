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
  expandButtonLabel?: string;
  isRequired?: boolean;
}

export function ExpandableField({
  name,
  label,
  className,
  compactView,
  expandedView,
  actions,
  expandButtonLabel = 'Expand to full screen',
  isRequired = false,
}: ExpandableFieldProps) {
  return (
    <Dialog>
      <div className={className}>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="gap-1" htmlFor={name}>
              {label}
              {isRequired && <span className="text-red-500">*</span>}
            </Label>
            {actions && <div className="flex gap-2">{actions}</div>}
          </div>
          <div className="relative">
            {compactView}
            <DialogTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="absolute bottom-2.5 right-2.5 h-6 w-6 hover:text-foreground transition-all backdrop-blur-sm bg-white/90 hover:bg-white/95 dark:bg-card dark:hover:bg-accent border border-border shadow-md dark:shadow-lg"
                type="button"
              >
                <Maximize className="h-4 w-4 text-muted-foreground " />
                <span className="sr-only">{expandButtonLabel}</span>
              </Button>
            </DialogTrigger>
          </div>
        </div>
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

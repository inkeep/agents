'use client';

import { RocketIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { UseInYourAppSection } from '@/components/use-in-your-app-section';

interface UseInYourAppModalProps {
  componentId: string;
  componentName?: string;
  renderCode?: string;
  docsPath: string;
  docsLabel?: string;
}

export function UseInYourAppModal({
  componentId,
  componentName,
  renderCode,
  docsPath,
  docsLabel,
}: UseInYourAppModalProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2">
          <RocketIcon className="size-4" />
          Use in your app
        </Button>
      </DialogTrigger>
      <DialogContent
        className="max-w-3xl max-h-[85dvh] grid-rows-[auto_1fr]"
        position="top"
        size="xl"
      >
        <DialogHeader className="shrink-0">
          <DialogTitle>Use in your app</DialogTitle>
          <DialogDescription className="sr-only">
            Steps to add this component to your application.
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 overflow-y-auto overflow-x-hidden pr-2 scrollbar-thin">
          <UseInYourAppSection
            componentId={componentId}
            componentName={componentName}
            renderCode={renderCode}
            docsPath={docsPath}
            docsLabel={docsLabel}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

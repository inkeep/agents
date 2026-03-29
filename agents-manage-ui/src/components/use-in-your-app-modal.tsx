'use client';

import { RocketIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { ExternalLink } from '@/components/ui/external-link';
import { UseInYourAppSection } from '@/components/use-in-your-app-section';

type ComponentKind = 'data' | 'artifact';

interface UseInYourAppModalProps {
  componentId: string;
  componentName?: string;
  componentKind?: ComponentKind;
  renderCode?: string;
  docsPath: string;
  docsLabel?: string;
}

export function UseInYourAppModal({
  componentId,
  componentName,
  componentKind = 'data',
  renderCode,
  docsPath,
  docsLabel = 'Learn more',
}: UseInYourAppModalProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" variant="outline" size="sm" className="gap-2">
          <RocketIcon className="size-4" />
          Use in your app
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl grid-rows-[auto_1fr]" position="top" size="xl">
        <DialogHeader className="shrink-0">
          <DialogTitle>Use in your app</DialogTitle>
          <DialogDescription className="sr-only">
            Steps to add this component to your application.
          </DialogDescription>
        </DialogHeader>
        <UseInYourAppSection
          componentId={componentId}
          componentName={componentName}
          componentKind={componentKind}
          renderCode={renderCode}
        />
        <DialogFooter>
          <ExternalLink href={docsPath}>{docsLabel}</ExternalLink>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

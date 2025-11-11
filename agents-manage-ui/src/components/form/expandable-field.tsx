'use client';

import { Maximize } from 'lucide-react';
import { type ComponentProps, type ReactNode, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useMonacoStore } from '@/features/agent/state/use-monaco-store';
import { cn } from '@/lib/utils';

type DialogProps = Required<ComponentProps<typeof Dialog>>;

interface ExpandableFieldProps {
  uri: string;
  label: string;
  className?: string;
  children: ReactNode;
  actions?: ReactNode;
  isRequired?: boolean;
  open: DialogProps['open'];
  onOpenChange: DialogProps['onOpenChange'];
  hasError?: boolean;
  id: string;
}

export function ExpandableField({
  id,
  uri,
  label,
  children,
  actions,
  isRequired = false,
  open,
  onOpenChange,
  hasError,
}: ExpandableFieldProps) {
  const monaco = useMonacoStore((state) => state.monaco);

  const handleClick = useCallback(() => {
    if (!monaco) {
      return;
    }
    const model = monaco.editor.getModel(monaco.Uri.parse(uri));
    const [editor] = monaco.editor.getEditors().filter((editor) => editor.getModel() === model);
    editor?.focus();
  }, [monaco, uri]);

  const content = (
    <>
      <div className="flex items-center justify-between">
        <Label id={id} className={cn(hasError && 'text-red-600', 'gap-1')} onClick={handleClick}>
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

'use client';

import type { ComponentProps, ReactNode } from 'react';
import { Editor } from '@/components/editors/editor';
import { Label } from '@/components/ui/label';
import { useMonacoActions } from '@/features/agent/state/use-monaco-store';
import { cn } from '@/lib/utils';

interface ExpandableFieldProps extends ComponentProps<typeof Editor.Dialog> {
  uri: string;
  className?: string;
  actions?: ReactNode;
  isRequired?: boolean;
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
  'use memo';

  const { getEditorByUri } = useMonacoActions();

  function focusEditor() {
    getEditorByUri(uri)?.focus();
  }

  return (
    <Editor.Dialog open={open} onOpenChange={onOpenChange} label={label}>
      <div className="gap-2 h-full flex flex-col">
        <div className="flex items-center justify-between overflow-x-auto">
          <Label
            id={id}
            className={cn('gap-1 shrink-0', hasError && 'text-destructive')}
            onClick={focusEditor}
          >
            {label}
            {isRequired && <span className="text-red-500">*</span>}
          </Label>
          <div className="flex gap-2">
            {actions}
            {!open && <Editor.DialogTrigger />}
          </div>
        </div>
        <div className="grow">{children}</div>
      </div>
    </Editor.Dialog>
  );
}

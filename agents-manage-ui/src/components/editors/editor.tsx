'use client';

import { Maximize } from 'lucide-react';
import { type ComponentProps, type FC, type JSX, type ReactNode, useTransition } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { useMonacoActions } from '@/features/agent/state/use-monaco-store';
import { cn } from '@/lib/utils';

interface EditorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  label: string | JSX.Element;
}

const EditorDialog: FC<EditorDialogProps> = ({ open, onOpenChange, children, label }) => {
  'use memo';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {children}
      <DialogContent size="fullscreen" className="duration-0">
        <DialogTitle className="sr-only">{label}</DialogTitle>
        <DialogDescription className="sr-only">{`${label} Editor`}</DialogDescription>
        <div className="flex flex-col w-full px-8 pb-8 pt-12 mx-auto max-w-7xl min-w-0 gap-2">
          {children}
        </div>
      </DialogContent>
    </Dialog>
  );
};

const EditorDialogTrigger: FC<ComponentProps<typeof Button>> = ({ className, ...props }) => {
  'use memo';
  return (
    <DialogTrigger asChild>
      <Button
        variant="link"
        size="sm"
        type="button"
        className={cn('text-xs rounded-sm h-6', className)}
        {...props}
      >
        <Maximize className="size-3.5" />
        Expand
      </Button>
    </DialogTrigger>
  );
};

const EditorFormatAction: FC<ComponentProps<typeof Button>> = (props) => {
  'use memo';
  const [isFormatting, startFormattingTransition] = useTransition();
  const { getEditorByUri } = useMonacoActions();

  return (
    <Button
      type="button"
      onClick={(event) => {
        const parent = event.currentTarget.closest<HTMLDivElement>('[data-mode-id]');
        if (!parent) return;
        const editorContainer = parent.querySelector<HTMLDivElement>('[data-uri]');
        if (!editorContainer) return;
        const uri = editorContainer.dataset.uri?.replace('file:///', '');
        if (!uri) return;
        const editor = getEditorByUri(uri);
        console.log({ editor });
        const formatAction = editor?.getAction('editor.action.formatDocument');
        startFormattingTransition(async () => {
          await Promise.all([
            formatAction?.run(),
            new Promise((resolve) => setTimeout(resolve, 500)),
          ]);
        });
      }}
      variant="outline"
      size="sm"
      className="backdrop-blur-xl h-6 px-2 text-xs rounded-sm"
      {...props}
      disabled={props.disabled || isFormatting}
    >
      Format
    </Button>
  );
};

/**
 * Base editor which will be used for declaring all editors in the future using
 * [Vercel composition patterns skill](.agents/skills/vercel-composition-patterns/AGENTS.md)
 */
export const Editor = {
  Dialog: EditorDialog,
  DialogTrigger: EditorDialogTrigger,
  FormatAction: EditorFormatAction,
};

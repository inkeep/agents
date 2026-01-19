import { Play, Settings } from 'lucide-react';
import { type ComponentProps, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { cn, isMacOs } from '@/lib/utils';
import { ShipModal } from '../ship/ship-modal';

type MaybePromise<T> = T | Promise<T>;

interface ToolbarProps {
  onSubmit: () => MaybePromise<boolean>;
  toggleSidePane: () => void;
  setShowPlayground: (show: boolean) => void;
}

const commonProps = {
  className: 'backdrop-blur-3xl',
  type: 'button',
  variant: 'outline',
} satisfies ComponentProps<typeof Button>;

export function Toolbar({ onSubmit, toggleSidePane, setShowPlayground }: ToolbarProps) {
  const dirty = useAgentStore((state) => state.dirty);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  const PreviewButton = (
    <Button {...commonProps} disabled={dirty} onClick={() => setShowPlayground(true)}>
      <Play className="size-4 text-muted-foreground" />
      Try it
    </Button>
  );

  useEffect(() => {
    function handleSaveShortcut(event: KeyboardEvent) {
      const isShortcutPressed = (isMacOs() ? event.metaKey : event.ctrlKey) && event.key === 's';
      if (!isShortcutPressed) return;
      event.preventDefault();
      // Using button ref instead onSubmit to respect button's disabled state
      saveButtonRef.current?.click();
    }

    window.addEventListener('keydown', handleSaveShortcut);
    return () => {
      window.removeEventListener('keydown', handleSaveShortcut);
    };
  }, []);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const saveAgent = async () => {
    setIsSubmitting(true);
    await onSubmit();
    setIsSubmitting(false);
  };

  return (
    <div className="flex gap-2 flex-wrap justify-end content-start">
      <ShipModal buttonClassName={commonProps.className} />
      {dirty ? (
        <Tooltip>
          <TooltipTrigger asChild>
            {/**
             * Wrap the disabled button in a <div> that can receive hover events since disabled <button> elements
             * don’t trigger pointer events in the browser
             **/}
            <div>{PreviewButton}</div>
          </TooltipTrigger>
          <TooltipContent>
            {dirty
              ? 'Please save your changes before trying the agent.'
              : 'Please save the agent to try it.'}
          </TooltipContent>
        </Tooltip>
      ) : (
        PreviewButton
      )}
      <Button
        {...commonProps}
        onClick={saveAgent}
        variant={dirty ? 'default' : 'outline'}
        disabled={isSubmitting || !dirty}
        ref={saveButtonRef}
      >
        <Spinner className={cn(!isSubmitting && 'hidden')} />
        Save changes
      </Button>
      <Button {...commonProps} onClick={toggleSidePane}>
        <Settings className="size-4" />
        Agent Settings
      </Button>
    </div>
  );
}

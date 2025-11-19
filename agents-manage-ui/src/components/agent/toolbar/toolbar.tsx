import { ArrowLeftRight, Play, Settings } from 'lucide-react';
import { type ComponentProps, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { isMacOs } from '@/lib/utils';
import { ShipModal } from '../ship/ship-modal';

type MaybePromise<T> = T | Promise<T>;

interface ToolbarProps {
  onSubmit: () => MaybePromise<boolean>;
  inPreviewDisabled?: boolean;
  toggleSidePane: () => void;
  setShowPlayground: (show: boolean) => void;
  setShowComparison?: (show: boolean) => void;
  hasMultipleBranches?: boolean;
}

export function Toolbar({
  onSubmit,
  inPreviewDisabled,
  toggleSidePane,
  setShowPlayground,
  setShowComparison,
  hasMultipleBranches = false,
}: ToolbarProps) {
  const dirty = useAgentStore((state) => state.dirty);
  const saveButtonRef = useRef<HTMLButtonElement>(null);

  const commonProps = {
    className: 'backdrop-blur-3xl',
    type: 'button',
    variant: 'outline',
  } satisfies ComponentProps<typeof Button>;

  const PreviewButton = (
    <Button
      {...commonProps}
      disabled={dirty || inPreviewDisabled}
      onClick={() => setShowPlayground(true)}
    >
      <Play className="size-4 text-muted-foreground" />
      Try it
    </Button>
  );

  const CompareButton = hasMultipleBranches && setShowComparison && (
    <Button
      {...commonProps}
      disabled={dirty || inPreviewDisabled}
      onClick={() => setShowComparison(true)}
    >
      <ArrowLeftRight className="size-4 text-muted-foreground" />
      Compare
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

  return (
    <div className="flex gap-2 flex-wrap justify-end content-start">
      {!inPreviewDisabled && <ShipModal buttonClassName={commonProps.className} />}
      {dirty || inPreviewDisabled ? (
        <>
          <Tooltip>
            <TooltipTrigger asChild>
              {/**
               * Wrap the disabled button in a <div> that can receive hover events since disabled <button> elements
               * don't trigger pointer events in the browser
               **/}
              <div>{PreviewButton}</div>
            </TooltipTrigger>
            <TooltipContent>
              {dirty
                ? 'Please save your changes before trying the agent.'
                : 'Please save the agent to try it.'}
            </TooltipContent>
          </Tooltip>
          {CompareButton && (
            <Tooltip>
              <TooltipTrigger asChild>
                <div>{CompareButton}</div>
              </TooltipTrigger>
              <TooltipContent>
                {dirty
                  ? 'Please save your changes before comparing branches.'
                  : 'Please save the agent to compare branches.'}
              </TooltipContent>
            </Tooltip>
          )}
        </>
      ) : (
        <>
          {PreviewButton}
          {CompareButton}
        </>
      )}
      <Button
        {...commonProps}
        onClick={onSubmit}
        variant={dirty ? 'default' : 'outline'}
        disabled={!dirty && !inPreviewDisabled}
        ref={saveButtonRef}
      >
        {inPreviewDisabled ? 'Save' : 'Save changes'}
      </Button>
      <Button {...commonProps} onClick={toggleSidePane}>
        <Settings className="size-4" />
        Agent Settings
      </Button>
    </div>
  );
}

import { Play, Settings } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { isMacOs } from '@/lib/utils';

interface ToolbarProps {
  onSubmit: () => void;
  inPreviewDisabled?: boolean;
  toggleSidePane: () => void;
  setShowPlayground: (show: boolean) => void;
}

export function Toolbar({
  onSubmit,
  inPreviewDisabled,
  toggleSidePane,
  setShowPlayground,
}: ToolbarProps) {
  const dirty = useAgentStore((state) => state.dirty);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const PreviewButton = (
    <Button
      disabled={dirty || inPreviewDisabled}
      variant="outline"
      type="button"
      onClick={() => setShowPlayground(true)}
    >
      <Play className="w-4 h-4 text-muted-foreground" />
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

  return (
    <div className="flex gap-2">
      {dirty || inPreviewDisabled ? (
        <Tooltip>
          <TooltipTrigger asChild>
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
        onClick={onSubmit}
        variant={dirty ? 'default' : 'outline'}
        disabled={!dirty && !inPreviewDisabled}
        ref={saveButtonRef}
      >
        {inPreviewDisabled ? 'Save' : 'Save changes'}
      </Button>
      <Button type="button" variant="outline" onClick={toggleSidePane}>
        <Settings className="w-4 h-4" />
        Agent Settings
      </Button>
    </div>
  );
}

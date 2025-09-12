import { Play, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useGraphStore } from '@/features/graph/state/use-graph-store';

interface ToolbarProps {
  onSubmit: () => void;
  isPreviewDisabled?: boolean;
  toggleSidePane: () => void;
  setShowPlayground: (show: boolean) => void;
}

export function Toolbar({
  onSubmit,
  isPreviewDisabled,
  toggleSidePane,
  setShowPlayground,
}: ToolbarProps) {
  const dirty = useGraphStore((state) => state.dirty);
  const PreviewButton = (
    <Button
      disabled={dirty || isPreviewDisabled}
      variant="outline"
      type="button"
      onClick={() => setShowPlayground(true)}
    >
      <Play className="w-4 h-4 text-muted-foreground" />
      Try it
    </Button>
  );

  return (
    <div className="flex gap-2">
      {dirty || isPreviewDisabled ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <div>{PreviewButton}</div>
          </TooltipTrigger>
          <TooltipContent>
            {dirty
              ? 'Please save your changes before trying the graph.'
              : 'Please save the graph to try it.'}
          </TooltipContent>
        </Tooltip>
      ) : (
        PreviewButton
      )}
      <Button
        onClick={onSubmit}
        variant={dirty ? 'default' : 'outline'}
        disabled={!dirty && !isPreviewDisabled}
      >
        {isPreviewDisabled ? 'Save' : 'Save changes'}
      </Button>
      <Button type="button" variant="ghost" onClick={toggleSidePane}>
        <span className="sr-only">Toggle side pane</span>
        <Settings className="w-4 h-4" />
      </Button>
    </div>
  );
}

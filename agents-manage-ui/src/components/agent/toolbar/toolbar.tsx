import { Activity, Play, Settings } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type ComponentProps, useEffect, useRef } from 'react';
import { useFormState } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useProjectPermissions } from '@/contexts/project';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { cn, isMacOs } from '@/lib/utils';
import { ShipModal } from '../ship/ship-modal';

interface ToolbarProps {
  toggleSidePane: () => void;
  setShowPlayground: (show: boolean) => void;
}

export function Toolbar({ toggleSidePane, setShowPlayground }: ToolbarProps) {
  'use memo';
  const form = useFullAgentFormContext();
  const agentDirtyState = useAgentStore((state) => state.dirty);
  const { isDirty, isSubmitting } = useFormState({ control: form.control });
  const dirty = agentDirtyState || isDirty;
  const hasOpenModelConfig = useAgentStore((state) => state.hasOpenModelConfig);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const { tenantId, projectId, agentId } = useParams<{
      tenantId: string;
      projectId: string;
      agentId: string;
  }>();
  const { canView, canUse, canEdit } = useProjectPermissions();

  const commonProps = {
    className: 'backdrop-blur-3xl',
    type: 'button',
    variant: 'outline',
  } satisfies ComponentProps<typeof Button>;

  const PreviewButton = (
    <Button
      {...commonProps}
      disabled={dirty || hasOpenModelConfig}
      onClick={() => setShowPlayground(true)}
    >
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

  return (
    <div className="pointer-events-auto flex gap-2 flex-wrap justify-end content-start">
      <Button {...commonProps} asChild>
        <Link href={tracesHref}>
          <Activity className="size-4 text-muted-foreground" />
          Traces
        </Link>
      </Button>
      {canUse && <ShipModal buttonClassName={commonProps.className} />}
      {(dirty || hasOpenModelConfig) && canUse ? (
        <Tooltip>
          <TooltipTrigger asChild>
            {/**
             * Wrap the disabled button in a <div> that can receive hover events since disabled <button> elements
             * don't trigger pointer events in the browser
             **/}
            <div>{PreviewButton}</div>
          </TooltipTrigger>
          <TooltipContent>
            {hasOpenModelConfig
              ? 'Please complete model configuration before trying the agent.'
              : dirty
                ? 'Please save your changes before trying the agent.'
                : 'Please save the agent to try it.'}
          </TooltipContent>
        </Tooltip>
      ) : canUse ? (
        PreviewButton
      ) : null}
      {canEdit && (
        <Button
          {...commonProps}
          type="submit"
          variant={dirty ? 'default' : 'outline'}
          disabled={isSubmitting || !dirty || hasOpenModelConfig}
          ref={saveButtonRef}
        >
          <Spinner className={cn(!isSubmitting && 'hidden')} />
          Save changes
        </Button>
      )}
      {canView && (
        <Button {...commonProps} onClick={toggleSidePane}>
          <Settings className="size-4" />
          Agent Settings
        </Button>
      )}
    </div>
  );
}

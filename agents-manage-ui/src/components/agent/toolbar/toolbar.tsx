import { Clock, Play, Settings, Webhook } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { type ComponentProps, useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useProjectPermissions } from '@/contexts/project';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { cn, isMacOs } from '@/lib/utils';
import { ShipModal } from '../ship/ship-modal';

type MaybePromise<T> = T | Promise<T>;

interface ToolbarProps {
  onSubmit: () => MaybePromise<boolean>;
  toggleSidePane: () => void;
  setShowPlayground: (show: boolean) => void;
}

export function Toolbar({ onSubmit, toggleSidePane, setShowPlayground }: ToolbarProps) {
  const dirty = useAgentStore((state) => state.dirty);
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

  const [isSubmitting, setIsSubmitting] = useState(false);
  const saveAgent = useCallback(async () => {
    setIsSubmitting(true);
    await onSubmit();
    setIsSubmitting(false);
  }, [onSubmit]);

  return (
    <div className="flex gap-2 flex-wrap justify-end content-start">
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
          onClick={saveAgent}
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
      {canEdit && (
        <Button {...commonProps} asChild>
          <Link href={`/${tenantId}/projects/${projectId}/agents/${agentId}/triggers`}>
            <Webhook className="size-4" />
            Triggers
          </Link>
        </Button>
      )}
      {canEdit && (
        <Button {...commonProps} asChild>
          <Link href={`/${tenantId}/projects/${projectId}/agents/${agentId}/scheduled-triggers`}>
            <Clock className="size-4" />
            Scheduled
          </Link>
        </Button>
      )}
    </div>
  );
}

import { Activity, Play, Settings } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlowButton } from '@/components/agent/flow-button';
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
  const isDirty = useAgentStore((state) => state.dirty);
  const hasOpenModelConfig = useAgentStore((state) => state.hasOpenModelConfig);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const { tenantId, projectId, agentId } = useParams<{
    tenantId: string;
    projectId: string;
    agentId: string;
  }>();
  const { canView, canUse, canEdit } = useProjectPermissions();

  const previewButton = (
    <FlowButton disabled={isDirty || hasOpenModelConfig} onClick={() => setShowPlayground(true)}>
      <Play className="text-muted-foreground" />
      Try it
    </FlowButton>
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
    <div className="pointer-events-auto flex gap-2 flex-wrap justify-end content-start">
      <FlowButton asChild>
        <Link href={`/${tenantId}/projects/${projectId}/traces?agentId=${agentId}`}>
          <Activity className="text-muted-foreground" />
          Traces
        </Link>
      </FlowButton>
      {canUse && (
        <>
          <ShipModal />
          {isDirty || hasOpenModelConfig ? (
            <Tooltip>
              <TooltipTrigger asChild>
                {/**
                 * Wrap the disabled button in a <div> that can receive hover events since disabled <button> elements
                 * don't trigger pointer events in the browser
                 **/}
                <div>{previewButton}</div>
              </TooltipTrigger>
              <TooltipContent>
                {hasOpenModelConfig
                  ? 'Please complete model configuration before trying the agent.'
                  : isDirty
                    ? 'Please save your changes before trying the agent.'
                    : 'Please save the agent to try it.'}
              </TooltipContent>
            </Tooltip>
          ) : (
            previewButton
          )}
        </>
      )}
      {canEdit && (
        <FlowButton
          className="border"
          onClick={saveAgent}
          variant={isDirty ? 'default' : 'outline'}
          disabled={isSubmitting || !isDirty || hasOpenModelConfig}
          ref={saveButtonRef}
        >
          <Spinner className={cn(!isSubmitting && 'hidden')} />
          Save changes
        </FlowButton>
      )}
      {canView && (
        <FlowButton onClick={toggleSidePane}>
          <Settings className="text-muted-foreground" />
          Agent Settings
        </FlowButton>
      )}
    </div>
  );
}

import { Activity, Play, Settings } from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { ErrorIndicator } from '@/components/agent/error-display/error-indicator';
import { FlowButton } from '@/components/agent/flow-button';
import { useGroupedAgentErrors } from '@/components/agent/use-grouped-agent-errors';
import { flatNestedFieldMessage } from '@/components/ui/form';
import { Spinner } from '@/components/ui/spinner';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useProjectPermissions } from '@/contexts/project';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { cn, isMacOs } from '@/lib/utils';
import { ShipModal } from './ship/ship-modal';

interface ToolbarProps {
  toggleSidePane: () => void;
  setShowPlayground: (show: boolean) => void;
}

export function Toolbar({ toggleSidePane, setShowPlayground }: ToolbarProps) {
  'use memo';
  const { formState } = useFullAgentFormContext();
  const agentDirtyState = useAgentStore((state) => state.dirty);
  const { isDirty: rhfDirtyState, isSubmitting } = formState;
  const isDirty = agentDirtyState || rhfDirtyState;
  const { agentSettings } = useGroupedAgentErrors();
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

  const agentSettingsErrors = Object.entries(agentSettings).map(([key, value]) => ({
    field: key,
    message: flatNestedFieldMessage(value),
  }));
  const hasErrors = agentSettingsErrors.length > 0;

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
          // fix layout shift, variant="default" doesn't have a border
          className="border"
          type="submit"
          variant={isDirty ? 'default' : 'outline'}
          disabled={isSubmitting || !isDirty || hasOpenModelConfig}
          ref={saveButtonRef}
        >
          <Spinner className={cn(!isSubmitting && 'hidden')} />
          Save changes
        </FlowButton>
      )}
      {canView && (
        <FlowButton
          onClick={toggleSidePane}
          className={cn(hasErrors && 'ring-2 text-red-300! border-current!')}
        >
          <Settings className={cn(!hasErrors && 'text-muted-foreground')} />
          Agent Settings
          {hasErrors && <ErrorIndicator errors={agentSettingsErrors} />}
        </FlowButton>
      )}
    </div>
  );
}

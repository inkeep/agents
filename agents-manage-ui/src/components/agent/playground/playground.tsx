import { zodResolver } from '@hookform/resolvers/zod';
import { Bug, X } from 'lucide-react';
import { type Dispatch, useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { z } from 'zod';
import { TimelineWrapper } from '@/components/traces/timeline/timeline-wrapper';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useCopilotContext } from '@/contexts/copilot';
import { useAgentStore } from '@/features/agent/state/use-agent-store';
import { useChatActivitiesPolling } from '@/hooks/use-chat-activities-polling';
import type { DataComponent } from '@/lib/api/data-components';
import { generateId } from '@/lib/utils/id-utils';
import {
  copyFullTraceToClipboard,
  copySummarizedTraceToClipboard,
} from '@/lib/utils/trace-formatter';
import { createCustomHeadersSchema } from '@/lib/validation';
import { ChatWidget } from './chat-widget';
import { CustomHeadersDialog } from './custom-headers-dialog';

interface PlaygroundProps {
  agentId: string;
  projectId: string;
  tenantId: string;
  setShowPlayground: (show: boolean) => void;
  closeSidePane: () => void;
  dataComponentLookup?: Record<string, DataComponent>;
  showTraces: boolean;
  setShowTraces: Dispatch<boolean>;
}

export const Playground = ({
  agentId,
  projectId,
  tenantId,
  closeSidePane,
  setShowPlayground,
  dataComponentLookup = {},
  showTraces,
  setShowTraces,
}: PlaygroundProps) => {
  const { setIsOpen: setIsCopilotOpen } = useCopilotContext();
  const [conversationId, setConversationId] = useState(generateId);
  const [customHeaders, setCustomHeaders] = useState<Record<string, string> | undefined>(undefined);
  const headersSchemaString = useAgentStore(({ metadata }) => metadata.contextConfig.headersSchema);
  const [isCustomHeadersModalOpen, setIsCustomHeadersModalOpen] = useState(false);
  const resolver = useMemo(
    () =>
      zodResolver(
        z.strictObject({
          headers: createCustomHeadersSchema(headersSchemaString),
        })
      ),
    [headersSchemaString]
  );

  const form = useForm({
    defaultValues: {
      headers: '',
    },
    resolver,
    mode: 'onChange',
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: validate on mount
  useEffect(() => {
    form.trigger().then(() => {
      const state = form.getFieldState('headers');
      if (!state.invalid) return;
      setIsCustomHeadersModalOpen(true);
    });
  }, []);

  const [isCopying, setIsCopying] = useState(false);
  const {
    chatActivities,
    isPolling,
    error,
    startPolling,
    stopPolling,
    retryConnection,
    refreshOnce,
  } = useChatActivitiesPolling({
    conversationId,
    tenantId,
    projectId,
  });

  const handleCopyFullTrace = async () => {
    if (!chatActivities) return;

    setIsCopying(true);
    try {
      const result = await copyFullTraceToClipboard(chatActivities, tenantId, projectId);
      if (result.success) {
        toast.success('Full trace copied to clipboard', {
          description: 'The complete OTEL trace has been copied successfully.',
        });
      } else {
        toast.error('Failed to copy trace', {
          description: result.error || 'An unknown error occurred',
        });
      }
    } catch (err) {
      toast.error('Failed to copy trace', {
        description: err instanceof Error ? err.message : 'An unknown error occurred',
      });
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 200));
      setIsCopying(false);
    }
  };

  const handleCopySummarizedTrace = async () => {
    if (!chatActivities) return;

    setIsCopying(true);
    try {
      const result = await copySummarizedTraceToClipboard(chatActivities, tenantId, projectId);
      if (result.success) {
        toast.success('Summarized trace copied to clipboard', {
          description: 'The activity timeline has been copied successfully.',
        });
      } else {
        toast.error('Failed to copy trace', {
          description: result.error || 'An unknown error occurred',
        });
      }
    } catch (err) {
      toast.error('Failed to copy trace', {
        description: err instanceof Error ? err.message : 'An unknown error occurred',
      });
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 200));
      setIsCopying(false);
    }
  };

  const hasHeadersError = !!form.formState.errors.headers?.message;

  return (
    <div className="bg-background flex flex-col h-full">
      <div className="flex min-h-0 items-center justify-between py-2 px-4 border-b shrink-0">
        <CustomHeadersDialog
          customHeaders={customHeaders}
          setCustomHeaders={setCustomHeaders}
          form={form}
          isOpen={isCustomHeadersModalOpen}
          setIsOpen={setIsCustomHeadersModalOpen}
        />
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6"
            onClick={() => {
              setShowTraces(!showTraces);
              if (!showTraces) {
                closeSidePane();
                setIsCopilotOpen(false);
              }
            }}
          >
            <Bug className="h-4 w-4" />
            {showTraces ? 'Hide debug' : 'Debug'}
          </Button>
          {!showTraces && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="h-6"
              onClick={() => setShowPlayground(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      <div className="flex-1 min-h-0 w-full">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel order={1}>
            <ChatWidget
              conversationId={conversationId}
              setConversationId={setConversationId}
              startPolling={startPolling}
              stopPolling={stopPolling}
              agentId={agentId}
              projectId={projectId}
              tenantId={tenantId}
              customHeaders={customHeaders}
              chatActivities={chatActivities}
              dataComponentLookup={dataComponentLookup}
              setShowTraces={setShowTraces}
              hasHeadersError={hasHeadersError}
            />
          </ResizablePanel>

          {showTraces && (
            <>
              <ResizableHandle />
              <TimelineWrapper
                isPolling={isPolling}
                conversation={chatActivities}
                enableAutoScroll
                error={error}
                retryConnection={retryConnection}
                refreshOnce={refreshOnce}
                showConversationTracesLink
                conversationId={conversationId}
                tenantId={tenantId}
                projectId={projectId}
                onCopyFullTrace={handleCopyFullTrace}
                onCopySummarizedTrace={handleCopySummarizedTrace}
                isCopying={isCopying}
              />
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

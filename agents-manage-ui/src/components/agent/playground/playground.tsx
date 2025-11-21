import { Bug, X } from 'lucide-react';
import { type Dispatch, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { TimelineWrapper } from '@/components/traces/timeline/timeline-wrapper';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useAgentActions } from '@/features/agent/state/use-agent-store';
import { useChatActivitiesPolling } from '@/hooks/use-chat-activities-polling';
import { fetchDataComponentsAction } from '@/lib/actions/data-components';
import type { DataComponent } from '@/lib/api/data-components';
import { createLookup } from '@/lib/utils';
import { generateId } from '@/lib/utils/id-utils';
import { copyTraceToClipboard } from '@/lib/utils/trace-formatter';
import { ChatWidget } from './chat-widget';
import CustomHeadersDialog from './custom-headers-dialog';

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
  const [conversationId, setConversationId] = useState(generateId);
  const [customHeaders, setCustomHeaders] = useState<Record<string, string>>({});
  const [isCopying, setIsCopying] = useState(false);
  const { setDataComponentLookup } = useAgentActions();
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
  });

  useEffect(() => {
    const refetchDataComponents = async (event: any) => {
      if (event.detail.type === 'tool_result' && event.detail.conversationId === conversationId) {
        try {
          const result = await fetchDataComponentsAction(tenantId, projectId);
          if (result.success) {
            const updatedLookup = createLookup(result.data);
            setDataComponentLookup(updatedLookup);
          }
        } catch (error) {
          console.error('Failed to refetch data components:', error);
        }
      }
    };

    document.addEventListener('ikp-data-operation', refetchDataComponents);
    return () => {
      document.removeEventListener('ikp-data-operation', refetchDataComponents);
    };
  }, [conversationId, tenantId, projectId, setDataComponentLookup]);

  const handleCopyTrace = async () => {
    if (!chatActivities) return;

    setIsCopying(true);
    try {
      const result = await copyTraceToClipboard(chatActivities);
      if (result.success) {
        toast.success('Trace copied to clipboard', {
          description: 'The OTEL trace has been copied successfully.',
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

  return (
    <div className="bg-background flex flex-col h-full">
      <div className="flex min-h-0 items-center justify-between py-2 px-4 border-b shrink-0">
        <CustomHeadersDialog customHeaders={customHeaders} setCustomHeaders={setCustomHeaders} />
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-6"
            onClick={() => {
              setShowTraces(!showTraces);
              if (!showTraces) {
                closeSidePane();
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
              key={JSON.stringify(customHeaders)}
            />
          </ResizablePanel>

          {showTraces && (
            <>
              <ResizableHandle />
              <TimelineWrapper
                isPolling={isPolling}
                conversation={chatActivities}
                enableAutoScroll={true}
                error={error}
                retryConnection={retryConnection}
                refreshOnce={refreshOnce}
                showConversationTracesLink={true}
                conversationId={conversationId}
                onCopyTrace={handleCopyTrace}
                isCopying={isCopying}
              />
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

import { Bug, X } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useState } from 'react';
import { TimelineWrapper } from '@/components/traces/timeline/timeline-wrapper';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useChatActivitiesPolling } from '@/hooks/use-chat-activities-polling';
import type { DataComponent } from '@/lib/api/data-components';
import { ChatWidget } from './chat-widget';
import CustomHeadersDialog from './custom-headers-dialog';

interface PlaygroundProps {
  agentId: string;
  projectId: string;
  tenantId: string;
  setShowPlayground: (show: boolean) => void;
  closeSidePane: () => void;
  dataComponentLookup?: Record<string, DataComponent>;
}

export const Playground = ({
  agentId,
  projectId,
  tenantId,
  closeSidePane,
  setShowPlayground,
  dataComponentLookup = {},
}: PlaygroundProps) => {
  const [conversationId, setConversationId] = useState<string>(nanoid());
  const [customHeaders, setCustomHeaders] = useState<Record<string, string>>({});
  const [showTraces, setShowTraces] = useState<boolean>(false);
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

  return (
    <div
      className={`bg-background z-10 flex flex-col border-l ${showTraces ? 'w-full' : 'w-1/3 min-w-96'}`}
    >
      <div className="flex min-h-0 items-center justify-between py-2 px-4 border-b flex-shrink-0">
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

          <Button
            variant="ghost"
            size="sm"
            className="h-6"
            onClick={() => setShowPlayground(false)}
          >
            <X className="h-4 w-4" />
          </Button>
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
              />
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

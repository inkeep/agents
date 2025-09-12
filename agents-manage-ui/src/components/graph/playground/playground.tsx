import { ArrowLeft } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useState } from 'react';
import { TimelineWrapper } from '@/components/traces/timeline/timeline-wrapper';
import { Button } from '@/components/ui/button';
import { ResizableHandle, ResizablePanel, ResizablePanelGroup } from '@/components/ui/resizable';
import { useChatActivitiesPolling } from '@/hooks/use-chat-activities-polling';
import { ChatWidget } from './chat-widget';
import CustomHeadersDialog from './custom-headers-dialog';

interface PlaygroundProps {
  graphId: string;
  projectId: string;
  tenantId: string;
  setShowPlayground: (show: boolean) => void;
}

export const Playground = ({
  graphId,
  projectId,
  tenantId,
  setShowPlayground,
}: PlaygroundProps) => {
  const [conversationId, setConversationId] = useState<string>(nanoid());
  const [customHeaders, setCustomHeaders] = useState<Record<string, string>>({});
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
    <div className="bg-background h-full w-full z-10 flex flex-col">
      <div className="flex min-h-0 items-center justify-between py-2 px-4 border-b flex-shrink-0">
        <Button variant="ghost" size="sm" className="h-6" onClick={() => setShowPlayground(false)}>
          <ArrowLeft className="h-4 w-4" />
          <span>Back to graph</span>
        </Button>
        <CustomHeadersDialog customHeaders={customHeaders} setCustomHeaders={setCustomHeaders} />
      </div>
      <div className="flex-1 min-h-0 w-full">
        <ResizablePanelGroup direction="horizontal">
          <ResizablePanel order={1}>
            <ChatWidget
              conversationId={conversationId}
              setConversationId={setConversationId}
              startPolling={startPolling}
              stopPolling={stopPolling}
              graphId={graphId}
              projectId={projectId}
              tenantId={tenantId}
              customHeaders={customHeaders}
              key={JSON.stringify(customHeaders)}
            />
          </ResizablePanel>
          <ResizableHandle />
          <TimelineWrapper
            isPolling={isPolling}
            conversation={chatActivities}
            enableAutoScroll={true}
            error={error}
            retryConnection={retryConnection}
            refreshOnce={refreshOnce}
            showConversationTracesLink={true}
          />
        </ResizablePanelGroup>
      </div>
    </div>
  );
};

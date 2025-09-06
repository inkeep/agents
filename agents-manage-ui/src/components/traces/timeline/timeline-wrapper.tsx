import { useEffect, useMemo, useState } from 'react';
import { ActivityTimeline } from '@/components/traces/timeline/activity-timeline';
import type {
  ActivityItem,
  SelectedPanel,
  PanelType,
  ConversationDetail,
} from '@/components/traces/timeline/types';
import { ActivityDetailsSidePane } from '@/components/traces/timeline/activity-details-sidepane';
import { ACTIVITY_TYPES } from '@/components/traces/timeline/types';
import { TOOL_TYPES } from '@/components/traces/timeline/types';
import { renderPanelContent } from '@/components/traces/timeline/render-panel-content';
import { StickToBottom } from 'use-stick-to-bottom';
import { ResizableHandle, ResizablePanel } from '@/components/ui/resizable';
import { Loader2, ChevronDown, ChevronUp, RefreshCw, AlertTriangle } from 'lucide-react';
import { ConversationTracesLink } from '@/components/traces/signoz-link';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';

function panelTitle(selected: SelectedPanel) {
  switch (selected.type) {
    case 'ai_generation':
      return 'AI Generation Details';
    case 'user_message':
      return 'User Message Details';
    case 'ai_assistant_message':
      return 'AI Assistant Message Details';
    case 'context_fetch':
      return 'Context Fetch Details';
    case 'context_resolution':
      return 'Context Resolution Details';
    case 'delegation':
      return 'Delegation Details';
    case 'transfer':
      return 'Transfer Details';
    case 'tool_purpose':
      return 'Tool Purpose Details';
    case 'generic_tool':
      return 'Tool Call Details';
    case 'ai_model_streamed_text':
      return 'AI Streaming Text Details';
    case 'mcp_tool_error':
      return 'MCP Tool Error Details';
    default:
      return 'Details';
  }
}

interface TimelineWrapperProps {
  conversation?: ConversationDetail | null;
  enableAutoScroll?: boolean;
  isPolling?: boolean;
  error?: string | null;
  retryConnection?: () => void;
  refreshOnce?: () => Promise<{ hasNewActivity: boolean }>;
  showConversationTracesLink?: boolean;
}

function EmptyTimeline({
  isPolling,
  error,
  retryConnection,
}: {
  isPolling: boolean;
  error?: string | null;
  retryConnection?: () => void;
}) {
  if (error) {
    return (
      <div className="flex flex-col gap-4 h-full justify-center items-center px-6">
        <Alert variant="destructive" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>{error}</AlertTitle>
        </Alert>
        {retryConnection && (
          <Button
            variant="outline"
            size="sm"
            onClick={retryConnection}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Retry Connection
          </Button>
        )}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-2 h-full justify-center items-center">
      {isPolling ? (
        <div className="flex flex-row gap-2 items-center text-gray-400 dark:text-white/50">
          <Loader2 className="w-4 h-4 animate-spin" />
          <p className="text-sm ">Waiting for activity...</p>
        </div>
      ) : (
        <p className="text-sm text-gray-400 dark:text-white/50">
          Start a conversation to see the activity timeline.
        </p>
      )}
    </div>
  );
}

export function TimelineWrapper({
  conversation,
  enableAutoScroll = false,
  isPolling = false,
  error,
  retryConnection,
  refreshOnce,
  showConversationTracesLink = false,
}: TimelineWrapperProps) {
  const [selected, setSelected] = useState<SelectedPanel | null>(null);
  const [panelVisible, setPanelVisible] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // State for collapsible AI messages
  const [collapsedAiMessages, setCollapsedAiMessages] = useState<Set<string>>(new Set());
  const [aiMessagesGloballyCollapsed, setAiMessagesGloballyCollapsed] =
    useState<boolean>(enableAutoScroll);

  useEffect(() => {
    if (selected) {
      setPanelVisible(false);
      const t = setTimeout(() => setPanelVisible(true), 10);
      return () => clearTimeout(t);
    } else {
      setPanelVisible(false);
    }
  }, [selected]);

  // Calculate activities and sorted activities first
  const activities =
    (conversation?.activities && conversation.activities.length > 0
      ? conversation.activities
      : conversation?.toolCalls?.map((tc: ActivityItem) => ({
          ...tc, // keep saveResultSaved, saveSummaryData, etc.
          id: tc.id ?? `tool-call-${Date.now()}`,
          type: 'tool_call' as const,
          description: `Called ${tc.toolName} tool${tc.toolDescription ? ` - ${tc.toolDescription}` : ''}`,
          timestamp: new Date(tc.timestamp).toISOString(),
          agentName: tc.agentName || 'AI Agent',
          toolResult: tc.result ?? tc.toolResult ?? 'Tool call completed',
        }))) || [];

  const sortedActivities = useMemo(() => {
    const list = [...activities];
    list.sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return ta !== tb ? ta - tb : String(a.id).localeCompare(String(b.id));
    });
    return list;
  }, [activities]);

  // Initialize AI messages based on view type when activities change
  useEffect(() => {
    const aiMessageIds = sortedActivities
      .filter(
        (activity) =>
          activity.type === ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE ||
          activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT
      )
      .map((activity) => activity.id);

    if (enableAutoScroll) {
      // Live trace view: default collapsed
      setCollapsedAiMessages(new Set(aiMessageIds));
      setAiMessagesGloballyCollapsed(true);
    } else {
      // Conversation details view: default expanded
      setCollapsedAiMessages(new Set());
      setAiMessagesGloballyCollapsed(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedActivities.length, enableAutoScroll]); //  Run when activities count or view type changes

  // Functions to handle expand/collapse all
  const expandAllAiMessages = () => {
    setCollapsedAiMessages(new Set());
    setAiMessagesGloballyCollapsed(false);
  };

  const collapseAllAiMessages = () => {
    const aiMessageIds = sortedActivities
      .filter(
        (activity) =>
          activity.type === ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE ||
          activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT
      )
      .map((activity) => activity.id);
    setCollapsedAiMessages(new Set(aiMessageIds));
    setAiMessagesGloballyCollapsed(true);
  };

  const toggleAiMessageCollapse = (activityId: string) => {
    const newCollapsed = new Set(collapsedAiMessages);
    if (newCollapsed.has(activityId)) {
      newCollapsed.delete(activityId);
    } else {
      newCollapsed.add(activityId);
    }
    setCollapsedAiMessages(newCollapsed);

    // Update global state based on current state
    const aiMessageIds = sortedActivities
      .filter(
        (activity) =>
          activity.type === ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE ||
          activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT
      )
      .map((activity) => activity.id);
    const allCollapsed = aiMessageIds.every((id) => newCollapsed.has(id));
    setAiMessagesGloballyCollapsed(allCollapsed);
  };

  const closePanel = () => {
    setPanelVisible(false);
    setTimeout(() => setSelected(null), 300);
  };

  const findSpanById = (id?: string) =>
    conversation?.allSpanAttributes?.find(
      (s: NonNullable<ConversationDetail['allSpanAttributes']>[number]) => s.spanId === id
    );

  const determinePanelType = (a: ActivityItem): Exclude<PanelType, 'mcp_tool_error'> => {
    if (a.type === ACTIVITY_TYPES.TOOL_CALL && a.toolType === TOOL_TYPES.TRANSFER)
      return 'transfer';
    if (a.type === ACTIVITY_TYPES.TOOL_CALL && a.toolName?.includes('delegate'))
      return 'delegation';
    if (
      a.type === ACTIVITY_TYPES.TOOL_CALL &&
      a.toolPurpose &&
      (a.toolType === TOOL_TYPES.MCP || a.toolType === TOOL_TYPES.TOOL)
    )
      return 'tool_purpose';
    if (a.type === ACTIVITY_TYPES.TOOL_CALL) return 'generic_tool';
    return a.type;
  };

  const handleRefresh = async () => {
    if (!refreshOnce || isRefreshing) return;
    setIsRefreshing(true);
    try {
      const result = await refreshOnce();
      if (!result.hasNewActivity) {
        toast.info('No new activity found');
      }
      setIsRefreshing(false);
    } catch {
      toast.error('Failed to refresh activities');
      setIsRefreshing(false);
    }
  };

  return (
    <>
      <ResizablePanel order={2}>
        <div className="bg-background h-full flex flex-col py-4">
          <div className="flex-shrink-0">
            <div className="flex items-center justify-between px-6 pb-4">
              <div className="text-foreground text-md font-medium">Activity Timeline</div>
              <div className="flex items-center gap-2">
                {/* Expand/Collapse AI Messages Buttons */}
                {sortedActivities.some(
                  (activity) =>
                    activity.type === ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE ||
                    activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT
                ) && (
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={
                        aiMessagesGloballyCollapsed ? expandAllAiMessages : collapseAllAiMessages
                      }
                      className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      title={
                        aiMessagesGloballyCollapsed
                          ? 'Expand all AI messages'
                          : 'Collapse all AI messages'
                      }
                    >
                      {aiMessagesGloballyCollapsed ? (
                        <>
                          <ChevronDown className="h-3 w-3 mr-1" />
                          Expand All
                        </>
                      ) : (
                        <>
                          <ChevronUp className="h-3 w-3 mr-1" />
                          Collapse All
                        </>
                      )}
                    </Button>
                  </div>
                )}
                {showConversationTracesLink && conversation?.conversationId && (
                  <ConversationTracesLink conversationId={conversation.conversationId} />
                )}
              </div>
            </div>
          </div>
          <div className="p-0 flex-1 min-h-0">
            {sortedActivities.length === 0 ? (
              <EmptyTimeline
                isPolling={isPolling}
                error={error}
                retryConnection={retryConnection}
              />
            ) : enableAutoScroll ? (
              <StickToBottom
                className="h-full [&>div]:overflow-y-auto [&>div]:scrollbar-thin [&>div]:scrollbar-thumb-muted-foreground/30 [&>div]:scrollbar-track-transparent dark:[&>div]:scrollbar-thumb-muted-foreground/50"
                resize="smooth"
                initial="smooth"
              >
                <StickToBottom.Content>
                  <ActivityTimeline
                    activities={sortedActivities}
                    onSelect={(activity) =>
                      setSelected({ type: determinePanelType(activity), item: activity })
                    }
                    collapsedAiMessages={collapsedAiMessages}
                    onToggleAiMessageCollapse={toggleAiMessageCollapse}
                  />
                  {!isPolling && sortedActivities.length > 0 && !error && refreshOnce && (
                    <div className="flex justify-center items-center z-10">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleRefresh}
                        disabled={isRefreshing}
                        className=" text-xs bg-background/80 backdrop-blur-sm  hover:bg-background/90 transition-all duration-200 opacity-70 hover:opacity-100"
                      >
                        {isRefreshing ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        {isRefreshing ? 'Refreshing...' : 'Refresh'}
                      </Button>
                    </div>
                  )}
                </StickToBottom.Content>
              </StickToBottom>
            ) : (
              <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent dark:scrollbar-thumb-muted-foreground/50">
                <ActivityTimeline
                  activities={sortedActivities}
                  onSelect={(activity) =>
                    setSelected({ type: determinePanelType(activity), item: activity })
                  }
                  collapsedAiMessages={collapsedAiMessages}
                  onToggleAiMessageCollapse={toggleAiMessageCollapse}
                />
              </div>
            )}
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      {/* Side Panel */}
      {selected && (
        <ResizablePanel order={3}>
          <ActivityDetailsSidePane
            title={panelTitle(selected)}
            open={panelVisible}
            onClose={closePanel}
          >
            {renderPanelContent({
              selected,
              findSpanById,
            })}
          </ActivityDetailsSidePane>
        </ResizablePanel>
      )}
    </>
  );
}

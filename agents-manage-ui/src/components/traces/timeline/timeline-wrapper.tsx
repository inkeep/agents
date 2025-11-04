import { AlertTriangle, ChevronDown, ChevronUp, Copy, Loader2, RefreshCw } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { StickToBottom } from 'use-stick-to-bottom';
import { ConversationTracesLink } from '@/components/traces/signoz-link';
import { ActivityDetailsSidePane } from '@/components/traces/timeline/activity-details-sidepane';
import { HierarchicalTimeline } from '@/components/traces/timeline/hierarchical-timeline';
import { renderPanelContent } from '@/components/traces/timeline/render-panel-content';
import type {
  ActivityItem,
  ConversationDetail,
  PanelType,
  SelectedPanel,
} from '@/components/traces/timeline/types';
import { ACTIVITY_TYPES, TOOL_TYPES } from '@/components/traces/timeline/types';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ExternalLink } from '@/components/ui/external-link';
import { ResizableHandle, ResizablePanel } from '@/components/ui/resizable';
import { DOCS_BASE_URL } from '@/constants/page-descriptions';

function panelTitle(selected: SelectedPanel) {
  switch (selected.type) {
    case 'ai_generation':
      return 'AI generation details';
    case 'agent_generation':
      return 'Agent generation details';
    case 'user_message':
      return 'User message details';
    case 'ai_assistant_message':
      return 'AI assistant message details';
    case 'context_fetch':
      return 'Context fetch details';
    case 'context_resolution':
      return 'Context resolution details';
    case 'delegation':
      return 'Delegation Details';
    case 'transfer':
      return 'Transfer details';
    case 'tool_purpose':
      return 'Tool purpose details';
    case 'generic_tool':
      return 'Tool call details';
    case 'ai_model_streamed_text':
      return 'AI Streaming text details';
    case 'ai_model_streamed_object':
      return 'AI Streaming object details';
    case 'mcp_tool_error':
      return 'MCP tool error details';
    case 'artifact_processing':
      return 'Artifact details';
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
  conversationId?: string;
  onCopyTrace?: () => void;
  isCopying?: boolean;
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
    const isMissingApiKey = error.includes('SIGNOZ_API_KEY is not configured');

    return (
      <div className="flex flex-col gap-4 h-full justify-center items-center px-6">
        <Alert variant="warning" className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>
            {isMissingApiKey ? 'SigNoz Configuration Required' : 'Connection Error'}
          </AlertTitle>
          <AlertDescription>
            {isMissingApiKey ? (
              <div>
                <p>
                  The SIGNOZ_API_KEY environment variable is not configured. Please set this
                  environment variable to the enable activity timeline.
                </p>
                <ExternalLink
                  className="text-amber-700 dark:text-amber-300 dark:hover:text-amber-200 ml-0 mt-1"
                  iconClassName="text-amber-700 dark:text-amber-300 dark:group-hover/link:text-amber-200"
                  href={`${DOCS_BASE_URL}/visual-builder/agent`}
                >
                  Learn more
                </ExternalLink>
              </div>
            ) : (
              <div>
                <p>{error}</p>
                <ExternalLink
                  className="text-amber-700 dark:text-amber-300 dark:hover:text-amber-200 ml-0 mt-1"
                  iconClassName="text-amber-700 dark:text-amber-300 dark:group-hover/link:text-amber-200"
                  href={`${DOCS_BASE_URL}/get-started/traces`}
                >
                  View traces setup guide
                </ExternalLink>
              </div>
            )}
          </AlertDescription>
        </Alert>
        {retryConnection && !isMissingApiKey && (
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
  conversationId,
  onCopyTrace,
  isCopying = false,
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

  // Clear selected panel when conversation changes
  useEffect(() => {
    if (conversationId) {
      setSelected(null);
    }
  }, [conversationId]);

  // Memoize activities calculation to prevent expensive operations on every render
  const activities = useMemo(() => {
    if (conversation?.activities && conversation.activities.length > 0) {
      return conversation.activities;
    }

    return (
      conversation?.toolCalls?.map((tc: ActivityItem) => ({
        ...tc, // keep saveResultSaved, saveSummaryData, etc.
        id: tc.id ?? `tool-call-${Date.now()}`,
        type: 'tool_call' as const,
        description: `Called ${tc.toolName} tool${tc.toolDescription ? ` - ${tc.toolDescription}` : ''}`,
        timestamp: new Date(tc.timestamp).toISOString(),
        subAgentName: tc.subAgentName || 'AI Agent',
        toolResult: tc.result ?? tc.toolResult ?? 'Tool call completed',
      })) || []
    );
  }, [conversation?.activities, conversation?.toolCalls]);

  // Memoize sorted activities to prevent re-sorting on every render
  const sortedActivities = useMemo(() => {
    const list = [...activities];
    list.sort((a, b) => {
      const ta = new Date(a.timestamp).getTime();
      const tb = new Date(b.timestamp).getTime();
      return ta !== tb ? ta - tb : String(a.id).localeCompare(String(b.id));
    });
    return list;
  }, [activities]);

  // Memoize AI message IDs to avoid recalculating on every render
  const aiMessageIds = useMemo(() => {
    return sortedActivities
      .filter(
        (activity) =>
          activity.type === ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE ||
          activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT ||
          activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_OBJECT ||
          (activity.hasError && activity.otelStatusDescription)
      )
      .map((activity) => activity.id);
  }, [sortedActivities]);

  // Memoize stream text IDs for cleaner collapse logic
  const streamTextIds = useMemo(() => {
    return sortedActivities
      .filter(
        (activity) =>
          activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT ||
          activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_OBJECT
      )
      .map((activity) => activity.id);
  }, [sortedActivities]);

  // Track which messages we've already processed
  const processedIdsRef = useRef<Set<string>>(new Set());
  const lastConversationRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    // Reset when conversation changes
    if (conversationId !== lastConversationRef.current) {
      lastConversationRef.current = conversationId;
      processedIdsRef.current = new Set();
      setCollapsedAiMessages(new Set());
      setAiMessagesGloballyCollapsed(false);
    }

    // Determine which IDs to auto-collapse based on view type
    const idsToProcess = enableAutoScroll ? aiMessageIds : streamTextIds;

    // Find new IDs that haven't been processed yet
    const newIds = idsToProcess.filter((id) => !processedIdsRef.current.has(id));

    if (newIds.length > 0) {
      // Mark these as processed
      newIds.forEach((id) => {
        processedIdsRef.current.add(id);
      });

      // Add new IDs to collapsed set
      setCollapsedAiMessages((prev) => {
        const updated = new Set(prev);
        newIds.forEach((id) => {
          updated.add(id);
        });
        return updated;
      });
      const allProcessed = idsToProcess.every((id) => processedIdsRef.current.has(id));
      if (enableAutoScroll) {
        setAiMessagesGloballyCollapsed(allProcessed && aiMessageIds.length > 0);
      } else {
        setAiMessagesGloballyCollapsed(
          allProcessed && streamTextIds.length === aiMessageIds.length && aiMessageIds.length > 0
        );
      }
    }
  }, [conversationId, aiMessageIds, streamTextIds, enableAutoScroll]);

  // Functions to handle expand/collapse all (memoized to prevent unnecessary re-renders)
  const expandAllAiMessages = useCallback(() => {
    setCollapsedAiMessages(new Set());
    setAiMessagesGloballyCollapsed(false);
  }, []);

  const collapseAllAiMessages = useCallback(() => {
    // Use the memoized aiMessageIds instead of recalculating
    setCollapsedAiMessages(new Set(aiMessageIds));
    setAiMessagesGloballyCollapsed(true);
  }, [aiMessageIds]);

  const toggleAiMessageCollapse = (activityId: string) => {
    const newCollapsed = new Set(collapsedAiMessages);
    if (newCollapsed.has(activityId)) {
      newCollapsed.delete(activityId);
    } else {
      newCollapsed.add(activityId);
    }
    setCollapsedAiMessages(newCollapsed);

    const aiMessageIds = sortedActivities
      .filter(
        (activity) =>
          activity.type === ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE ||
          activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT ||
          activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_OBJECT ||
          (activity.hasError && activity.otelStatusDescription)
      )
      .map((activity) => activity.id);
    const allCollapsed = aiMessageIds.every((id) => newCollapsed.has(id));
    setAiMessagesGloballyCollapsed(allCollapsed);
  };

  const closePanel = () => {
    setPanelVisible(false);
    setTimeout(() => {
      setSelected(null);
    }, 300);
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
        toast.info('No new activity found.');
      }
      setIsRefreshing(false);
    } catch {
      toast.error('Failed to refresh activities.');
      setIsRefreshing(false);
    }
  };

  return (
    <>
      <ResizablePanel id="activity-timeline" order={2}>
        <div className="bg-background h-full flex flex-col py-4">
          <div className="flex-shrink-0">
            <div className="flex items-center justify-between px-6 pb-4">
              <div className="flex items-center gap-2">
                <div className="text-foreground text-md font-medium">Activity timeline</div>
              </div>
              <div className="flex items-center gap-2">
                {/* Copy JSON Button */}
                {onCopyTrace && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onCopyTrace}
                    disabled={isCopying}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                    title="Copy trace as JSON"
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    {isCopying ? 'Copying...' : 'Copy Trace'}
                  </Button>
                )}
                {/* Expand/Collapse AI Messages Buttons */}
                {sortedActivities.some(
                  (activity) =>
                    activity.type === ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE ||
                    activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT ||
                    activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_OBJECT ||
                    (activity.hasError && activity.otelStatusDescription)
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
                  <HierarchicalTimeline
                    activities={sortedActivities}
                    onSelect={(activity) => {
                      setSelected({
                        type: determinePanelType(activity),
                        item: activity,
                      });
                    }}
                    selectedActivityId={selected?.item?.id}
                    collapsedAiMessages={collapsedAiMessages}
                    onToggleAiMessageCollapse={toggleAiMessageCollapse}
                    allSpanAttributes={conversation?.allSpanAttributes}
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
                <HierarchicalTimeline
                  activities={sortedActivities}
                  onSelect={(activity) => {
                    setSelected({
                      type: determinePanelType(activity),
                      item: activity,
                    });
                  }}
                  selectedActivityId={selected?.item?.id}
                  collapsedAiMessages={collapsedAiMessages}
                  onToggleAiMessageCollapse={toggleAiMessageCollapse}
                  allSpanAttributes={conversation?.allSpanAttributes}
                />
              </div>
            )}
          </div>
        </div>
      </ResizablePanel>
      <ResizableHandle />
      {/* Side Panel */}
      {selected && (
        <ResizablePanel id="activity-details-sidepane" order={3}>
          <ActivityDetailsSidePane
            key={selected.item.id}
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

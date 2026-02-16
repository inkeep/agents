import {
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  FileText,
  Loader2,
  RefreshCw,
  RotateCcw,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ExternalLink } from '@/components/ui/external-link';
import { ResizableHandle, ResizablePanel } from '@/components/ui/resizable';
import { DOCS_BASE_URL } from '@/constants/theme';
import { toast } from '@/lib/toast';
import { buildFullTrace, buildSummarizedTrace } from '@/lib/utils/trace-formatter';

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
    case 'mcp_tool_error':
      return 'MCP tool error details';
    case 'artifact_processing':
      return 'Artifact details';
    case 'tool_approval_requested':
      return 'Requested tool details';
    case 'tool_approval_approved':
      return 'Approved tool details';
    case 'tool_approval_denied':
      return 'Denied tool details';
    case 'max_steps_reached':
      return 'Max steps reached';
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
  tenantId?: string;
  projectId?: string;
  onCopyFullTrace?: () => void;
  onCopySummarizedTrace?: () => void;
  isCopying?: boolean;
  onRerunTrigger?: () => void;
  isRerunning?: boolean;
  showRerunTrigger?: boolean;
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
  tenantId,
  projectId,
  onCopyFullTrace,
  onCopySummarizedTrace,
  isCopying = false,
  onRerunTrigger,
  isRerunning = false,
  showRerunTrigger = false,
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
    }
    setPanelVisible(false);
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

  // Token estimates state - calculated when dropdown opens
  const [tokenEstimates, setTokenEstimates] = useState<{
    summarized: number | null;
    full: number | null;
  }>({ summarized: null, full: null });
  const [isCalculatingTokens, setIsCalculatingTokens] = useState(false);

  // Calculate token estimates when dropdown opens
  const calculateTokenEstimates = useCallback(async () => {
    if (!conversation || !tenantId || !projectId || tokenEstimates.summarized !== null) return;

    setIsCalculatingTokens(true);
    try {
      // Build actual traces (same as what gets copied)
      const [summarizedTrace, fullTrace] = await Promise.all([
        buildSummarizedTrace(conversation, tenantId, projectId),
        buildFullTrace(conversation, tenantId, projectId),
      ]);

      setTokenEstimates({
        summarized: Math.ceil(JSON.stringify(summarizedTrace).length / 4),
        full: Math.ceil(JSON.stringify(fullTrace).length / 4),
      });
    } finally {
      setIsCalculatingTokens(false);
    }
  }, [conversation, tenantId, projectId, tokenEstimates.summarized]);

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

  // Ref to track if we've already scrolled to the first error
  const hasScrolledToErrorRef = useRef<string | undefined>(undefined);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Memoize AI message IDs to avoid recalculating on every render
  const aiMessageIds = useMemo(() => {
    return sortedActivities
      .filter(
        (activity) =>
          activity.type === ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE ||
          activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT ||
          (activity.hasError && activity.otelStatusDescription)
      )
      .map((activity) => activity.id);
  }, [sortedActivities]);

  // Memoize stream text IDs for cleaner collapse logic
  const streamTextIds = useMemo(() => {
    return sortedActivities
      .filter((activity) => activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT)
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

  // Auto-scroll to first error when conversation loads (only for static view, not auto-scroll/polling mode)
  useEffect(() => {
    // Skip if auto-scroll is enabled (polling mode)
    if (enableAutoScroll) {
      return;
    }

    // Skip if we've already scrolled for this conversation
    if (hasScrolledToErrorRef.current === conversationId) {
      return;
    }

    // Small delay to ensure DOM is rendered
    const timeoutId = setTimeout(() => {
      const errorElement = scrollContainerRef.current?.querySelector('[data-has-error="true"]');
      if (errorElement) {
        errorElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        hasScrolledToErrorRef.current = conversationId;
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [conversationId, enableAutoScroll]);

  // Reset scroll tracking when conversation changes
  useEffect(() => {
    if (conversationId !== lastConversationRef.current) {
      hasScrolledToErrorRef.current = undefined;
    }
  }, [conversationId]);

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
      setLazySpan(null);
    }, 300);
  };

  // Lazy-loaded span attributes — fetched on-demand when an activity is clicked
  const [lazySpan, setLazySpan] = useState<
    NonNullable<ConversationDetail['allSpanAttributes']>[number] | null
  >(null);
  const [lazySpanLoading, setLazySpanLoading] = useState(false);

  // Fetch span details when a panel is selected
  useEffect(() => {
    if (!selected || selected.type === 'mcp_tool_error') {
      setLazySpan(null);
      return;
    }
    const activityId = selected.item.id;
    if (!activityId || !conversationId || !tenantId) {
      setLazySpan(null);
      return;
    }

    let cancelled = false;
    setLazySpan(null);
    setLazySpanLoading(true);

    fetch(
      `/api/signoz/spans/${activityId}?conversationId=${encodeURIComponent(conversationId)}&tenantId=${encodeURIComponent(tenantId)}`
    )
      .then((res) => {
        if (!res.ok) {
          console.warn(`Span fetch failed: ${res.status} ${res.statusText}`);
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled && data?.spanId) {
          setLazySpan(data);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch span details:', err);
      })
      .finally(() => {
        if (!cancelled) setLazySpanLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [selected, conversationId, tenantId]);

  const findSpanById = useCallback(
    (id?: string) => (id && lazySpan?.spanId === id ? lazySpan : undefined),
    [lazySpan]
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
                {/* Rerun Trigger Button */}
                {showRerunTrigger && onRerunTrigger && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRerunTrigger}
                    disabled={isRerunning}
                    className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                  >
                    {isRerunning ? (
                      <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                    ) : (
                      <RotateCcw className="h-3 w-3 mr-1" />
                    )}
                    {isRerunning ? 'Rerunning...' : 'Rerun Trigger'}
                  </Button>
                )}
                {/* Copy Trace Dropdown */}
                {(onCopyFullTrace || onCopySummarizedTrace) && (
                  <DropdownMenu onOpenChange={(open) => open && calculateTokenEstimates()}>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isCopying}
                        className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        {isCopying ? 'Copying...' : 'Copy Trace'}
                        <ChevronDown className="h-3 w-3 ml-1" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {onCopySummarizedTrace && (
                        <DropdownMenuItem onClick={onCopySummarizedTrace} disabled={isCopying}>
                          <FileText className="h-3.5 w-3.5 mr-2" />
                          <span className="flex-1">Copy Summarized Trace</span>
                          <span className="text-muted-foreground text-xs ml-2">
                            {isCalculatingTokens
                              ? '...'
                              : tokenEstimates.summarized !== null
                                ? `~${tokenEstimates.summarized.toLocaleString()} tokens`
                                : ''}
                          </span>
                        </DropdownMenuItem>
                      )}
                      {onCopyFullTrace && (
                        <DropdownMenuItem onClick={onCopyFullTrace} disabled={isCopying}>
                          <Copy className="h-3.5 w-3.5 mr-2" />
                          <span className="flex-1">Copy Full Trace</span>
                          <span className="text-muted-foreground text-xs ml-2">
                            {isCalculatingTokens
                              ? '...'
                              : tokenEstimates.full !== null
                                ? `~${tokenEstimates.full.toLocaleString()} tokens`
                                : ''}
                          </span>
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
                {/* Expand/Collapse AI Messages Buttons */}
                {sortedActivities.some(
                  (activity) =>
                    activity.type === ACTIVITY_TYPES.AI_ASSISTANT_MESSAGE ||
                    activity.type === ACTIVITY_TYPES.AI_MODEL_STREAMED_TEXT ||
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
              <div
                ref={scrollContainerRef}
                className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-muted-foreground/30 scrollbar-track-transparent dark:scrollbar-thumb-muted-foreground/50"
              >
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
              spanLoading: lazySpanLoading,
            })}
          </ActivityDetailsSidePane>
        </ResizablePanel>
      )}
    </>
  );
}

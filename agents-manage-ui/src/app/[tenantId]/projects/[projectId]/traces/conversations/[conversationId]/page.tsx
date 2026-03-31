'use client';

import type { Part } from '@inkeep/agents-core';
import {
  Activity,
  ArrowLeft,
  Coins,
  ExternalLink as ExternalLinkIcon,
  MessageSquare,
  Timer,
  TriangleAlert,
} from 'lucide-react';
import NextLink from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { MCPBreakdownCard } from '@/components/traces/mcp-breakdown-card';
import { SignozLink } from '@/components/traces/signoz-link';
import { InfoRow } from '@/components/traces/timeline/blocks';
import { TimelineWrapper } from '@/components/traces/timeline/timeline-wrapper';
import {
  ACTIVITY_TYPES,
  type ConversationDetail as ConversationDetailType,
} from '@/components/traces/timeline/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink } from '@/components/ui/external-link';
import { ResizablePanelGroup } from '@/components/ui/resizable';
import { Skeleton } from '@/components/ui/skeleton';
import { GENERATION_TYPES } from '@/constants/signoz';
import { FeedbackDialog } from '@/components/agent/playground/feedback-dialog';
import { useRuntimeConfig } from '@/contexts/runtime-config';
import { rerunScheduledTriggerInvocationAction } from '@/lib/actions/scheduled-triggers';
import { rerunTriggerAction } from '@/lib/actions/triggers';
import { getSigNozStatsClient } from '@/lib/api/signoz-stats';
import { formatDateTime, formatDuration } from '@/lib/utils/format-date';
import { getSignozTracesExplorerUrl } from '@/lib/utils/signoz-links';
import {
  copyFullTraceToClipboard,
  copySummarizedTraceToClipboard,
} from '@/lib/utils/trace-formatter';

export default function ConversationDetail({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/traces/conversations/[conversationId]'>) {
  const { conversationId, tenantId, projectId } = use(params);
  const backLink = `/${tenantId}/projects/${projectId}/traces` as const;

  const router = useRouter();
  const searchParams = useSearchParams();
  const highlightMessageId = searchParams.get('messageId');
  const [conversation, setConversation] = useState<ConversationDetailType | null>(null);
  const [usageEvents, setUsageEvents] = useState<
    Array<{
      generationType: string;
      estimatedCostUsd: number;
      inputTokens: number;
      outputTokens: number;
      resolvedModel?: string;
      requestedModel?: string;
      model: string;
    }>
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [isRerunning, setIsRerunning] = useState(false);
  const [feedbackDialog, setFeedbackDialog] = useState<{
    open: boolean;
    messageId?: string;
  }>({ open: false });
  const { PUBLIC_SIGNOZ_URL, PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT } = useRuntimeConfig();
  const isCloudDeployment = PUBLIC_IS_INKEEP_CLOUD_DEPLOYMENT === 'true';

  const handleCopyFullTrace = async () => {
    if (!conversation) return;

    setIsCopying(true);
    try {
      const result = await copyFullTraceToClipboard(conversation, tenantId, projectId);
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
    if (!conversation) return;

    setIsCopying(true);
    try {
      const result = await copySummarizedTraceToClipboard(conversation, tenantId, projectId);
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

  const handleRerunTrigger = async () => {
    if (!conversation?.triggerId || !conversation?.agentId) return;

    const isScheduledTrigger = conversation.invocationType === 'scheduled_trigger';

    if (isScheduledTrigger) {
      if (!conversation.triggerInvocationId) {
        toast.error('Missing invocation ID — cannot rerun scheduled trigger from this trace');
        return;
      }

      setIsRerunning(true);
      try {
        const result = await rerunScheduledTriggerInvocationAction(
          tenantId,
          projectId,
          conversation.agentId,
          conversation.triggerId,
          conversation.triggerInvocationId
        );

        if (result.success && result.data) {
          toast.success('Scheduled trigger rerun dispatched', {
            description: `New invocation: ${result.data.newInvocationId}`,
          });
        } else {
          toast.error('Failed to rerun scheduled trigger', {
            description: result.error || 'An unknown error occurred',
          });
        }
      } catch (err) {
        toast.error('Failed to rerun scheduled trigger', {
          description: err instanceof Error ? err.message : 'An unknown error occurred',
        });
      } finally {
        setIsRerunning(false);
      }
      return;
    }

    const userMessageActivity = conversation.activities?.find(
      (a) => a.type === 'user_message' && a.messageContent
    );

    if (!userMessageActivity?.messageContent) {
      toast.error('No user message found in trace to rerun');
      return;
    }

    setIsRerunning(true);
    try {
      let messageParts: Part[] | undefined;
      if (userMessageActivity.messageParts) {
        try {
          messageParts = JSON.parse(userMessageActivity.messageParts);
        } catch (parseError) {
          console.warn('Failed to parse messageParts for rerun, falling back to text-only', {
            conversationId,
            error: parseError instanceof Error ? parseError.message : String(parseError),
          });
        }
      }

      const result = await rerunTriggerAction(
        tenantId,
        projectId,
        conversation.agentId,
        conversation.triggerId,
        {
          userMessage: userMessageActivity.messageContent,
          messageParts,
        }
      );

      if (result.success && result.data) {
        toast.success('Trigger rerun dispatched', {
          description: `New conversation: ${result.data.conversationId}`,
          action: {
            label: 'View',
            onClick: () => {
              router.push(
                `/${tenantId}/projects/${projectId}/traces/conversations/${result.data?.conversationId}`
              );
            },
          },
        });
      } else {
        toast.error('Failed to rerun trigger', {
          description: result.error || 'An unknown error occurred',
        });
      }
    } catch (err) {
      toast.error('Failed to rerun trigger', {
        description: err instanceof Error ? err.message : 'An unknown error occurred',
      });
    } finally {
      setIsRerunning(false);
    }
  };

  useEffect(() => {
    const fetchConversationDetail = async () => {
      try {
        setLoading(true);
        setError(null);

        const client = getSigNozStatsClient(tenantId);
        const start = new Date('2020-01-01T00:00:00Z').getTime();
        const end = Date.now();

        const [traceResponse, eventsResult] = await Promise.allSettled([
          fetch(
            `/api/traces/conversations/${conversationId}?tenantId=${tenantId}&projectId=${projectId}`
          ),
          client.getUsageEventsList(start, end, projectId, conversationId, 200),
        ]);

        if (traceResponse.status === 'rejected' || !traceResponse.value.ok) {
          throw new Error('Failed to fetch conversation details');
        }
        const data = await traceResponse.value.json();
        setConversation(data);

        setUsageEvents(
          eventsResult.status === 'fulfilled'
            ? eventsResult.value.filter(
                (e: { generationType: string }) =>
                  e.generationType !== GENERATION_TYPES.EVAL_SCORING &&
                  e.generationType !== GENERATION_TYPES.EVAL_SIMULATION
              )
            : []
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (conversationId && tenantId && projectId) fetchConversationDetail();
  }, [conversationId, tenantId, projectId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <Card className="shadow-none bg-background">
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading Conversation</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error || 'Conversation not found.'}</p>
          <Button asChild variant="outline" className="mt-4">
            <NextLink href={backLink}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Overview
            </NextLink>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full flex flex-col no-parent-container p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-shrink-0">
        <div className="flex items-center gap-2">
          <Button asChild variant="ghost" size="icon-sm">
            <NextLink href={backLink}>
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </NextLink>
          </Button>
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-light">Conversation Details</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setFeedbackDialog({ open: true })}
          >
            <MessageSquare className="h-4 w-4 mr-1.5" />
            Leave Feedback
          </Button>
          {(conversation.agentId || conversation.agentName) && (
            <ExternalLink
              href={`/${tenantId}/projects/${projectId}/agents/${conversation.agentId}`}
            >
              {conversation.agentName ? `${conversation.agentName}` : conversation.agentId}
            </ExternalLink>
          )}
          <SignozLink conversationId={conversationId} />
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4 mb-4 flex-shrink-0">
        {/* Duration */}
        {(() => {
          const hasAssistantResponse = conversation.activities?.some(
            (a) => a.type === 'ai_assistant_message'
          );
          const showEndTime = hasAssistantResponse && conversation.conversationEndTime;

          return (
            <Card
              className="shadow-none bg-background max-h-[280px] flex flex-col"
              title={
                conversation.conversationStartTime
                  ? `Start: ${formatDateTime(conversation.conversationStartTime, { local: true })}${showEndTime && conversation.conversationEndTime ? `\nEnd: ${formatDateTime(conversation.conversationEndTime, { local: true })}` : ''}`
                  : 'Timing data not available'
              }
            >
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-foreground">Duration</CardTitle>
                <Activity className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {conversation.conversationStartTime ? (
                    <>
                      <div className="text-sm font-medium text-foreground">
                        <div className="flex items-center gap-1">
                          <span className="text-xs text-muted-foreground">Start:</span>
                          <span className="text-xs font-mono">
                            {formatDateTime(conversation.conversationStartTime, { local: true })}
                          </span>
                        </div>
                        {showEndTime ? (
                          <div className="flex items-center gap-1 mt-1">
                            <span className="text-xs text-muted-foreground">End:</span>
                            <span className="text-xs font-mono">
                              {conversation.conversationEndTime &&
                                formatDateTime(conversation.conversationEndTime, { local: true })}
                            </span>
                          </div>
                        ) : null}
                      </div>
                      <div className="space-y-1 mt-2">
                        {hasAssistantResponse && conversation.conversationDuration && (
                          <div className="text-xs text-muted-foreground">
                            <span className="font-medium">Conversation Duration:</span>{' '}
                            {formatDuration(conversation.conversationDuration)}
                          </div>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="text-sm text-muted-foreground">Timing data not available</div>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })()}

        {/* AI Usage & Cost */}
        <Card className="shadow-none bg-background max-h-[280px] flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 flex-shrink-0">
            <CardTitle className="text-sm font-medium text-foreground">AI Usage & Cost</CardTitle>
            <Coins className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex-1 min-h-0 overflow-y-auto -mt-2">
            {(() => {
              const events = usageEvents.length > 0 ? usageEvents : [];
              const totalCost = events.reduce((sum, e) => sum + (e.estimatedCostUsd || 0), 0);
              const totalIn = events.reduce((sum, e) => sum + (e.inputTokens || 0), 0);
              const totalOut = events.reduce((sum, e) => sum + (e.outputTokens || 0), 0);

              if (events.length === 0) {
                return (
                  <div className="text-center">
                    <div className="text-2xl font-bold text-muted-foreground mb-1">—</div>
                    <p className="text-xs text-muted-foreground">No usage data available</p>
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  <div>
                    <div className="text-2xl font-bold text-foreground">
                      {totalCost < 0.01 ? `$${totalCost.toFixed(6)}` : `$${totalCost.toFixed(2)}`}
                    </div>
                    <div className="text-sm font-medium text-foreground mt-1">
                      {totalIn.toLocaleString()} <span className="text-muted-foreground">in</span>
                      {' / '}
                      {totalOut.toLocaleString()} <span className="text-muted-foreground">out</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {events.length} calls
                    </div>
                  </div>
                  {events.map((event, idx) => (
                    <div
                      key={`${event.generationType}-${idx}`}
                      className="border border-border rounded-lg p-3"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-foreground">
                          {event.generationType.replace(/_/g, ' ')}
                        </span>
                        <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400">
                          {event.estimatedCostUsd
                            ? event.estimatedCostUsd < 0.01
                              ? `$${event.estimatedCostUsd.toFixed(6)}`
                              : `$${event.estimatedCostUsd.toFixed(4)}`
                            : '—'}
                        </span>
                      </div>
                      <div className="space-y-0.5">
                        <InfoRow
                          label="Tokens"
                          value={`${event.inputTokens.toLocaleString()} in / ${event.outputTokens.toLocaleString()} out`}
                        />
                        <InfoRow label="Model" value={event.model} />
                      </div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* MCP Tools */}
        <MCPBreakdownCard conversation={conversation} />

        {/* Alerts */}
        <Card className="shadow-none bg-background max-h-[280px] flex flex-col">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2 flex-shrink-0">
            <CardTitle className="text-sm font-medium text-foreground">Alerts</CardTitle>
            <TriangleAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent className="flex-1 min-h-0 overflow-y-auto">
            {(() => {
              const errors = conversation.errorCount ?? 0;
              const warnings = conversation.warningCount ?? 0;
              const total = errors + warnings;
              const streamTimeoutActivity = conversation.activities?.find(
                (a) => a.type === ACTIVITY_TYPES.STREAM_LIFETIME_EXCEEDED
              );

              return (
                <>
                  {streamTimeoutActivity && (
                    <div className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 mb-3 dark:border-red-900 dark:bg-red-950/50">
                      <Timer className="h-4 w-4 text-red-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-red-700 dark:text-red-400">
                          Stream timed out
                        </p>
                        {streamTimeoutActivity.streamMaxLifetimeMs &&
                          streamTimeoutActivity.streamMaxLifetimeMs > 0 && (
                            <p className="text-xs text-red-600/70 dark:text-red-400/70">
                              Exceeded {streamTimeoutActivity.streamMaxLifetimeMs / 1000}s limit
                            </p>
                          )}
                      </div>
                    </div>
                  )}
                  {total > 0 ? (
                    <div className="space-y-1">
                      {errors > 0 && (
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-bold font-mono text-red-600">
                            {errors}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            error{errors > 1 ? 's' : ''}
                          </span>
                        </div>
                      )}
                      {warnings > 0 && (
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xl font-bold font-mono text-yellow-500">
                            {warnings}
                          </span>
                          <span className="text-sm text-muted-foreground">
                            warning{warnings > 1 ? 's' : ''}
                          </span>
                        </div>
                      )}
                    </div>
                  ) : !streamTimeoutActivity ? (
                    <div>
                      <div className="text-2xl font-bold font-mono text-green-600 mb-1">0</div>
                      <p className="text-xs text-muted-foreground">No warnings or errors</p>
                    </div>
                  ) : null}
                  {total > 0 && !isCloudDeployment && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full flex items-center justify-center gap-1"
                      onClick={() => {
                        window.open(
                          getSignozTracesExplorerUrl(conversationId, PUBLIC_SIGNOZ_URL),
                          '_blank'
                        );
                      }}
                    >
                      <ExternalLinkIcon className="h-3 w-3" />
                      View in SigNoz
                    </Button>
                  )}
                </>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Timeline Panel - Takes remaining height */}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup
          direction="horizontal"
          className="h-full border rounded-xl bg-background"
        >
          <TimelineWrapper
            conversation={conversation}
            conversationId={conversationId}
            tenantId={tenantId}
            projectId={projectId}
            highlightMessageId={highlightMessageId}
            onLeaveFeedback={(_activityId, messageId) => {
              setFeedbackDialog({ open: true, messageId });
            }}
            onCopyFullTrace={handleCopyFullTrace}
            onCopySummarizedTrace={handleCopySummarizedTrace}
            isCopying={isCopying}
            onRerunTrigger={handleRerunTrigger}
            isRerunning={isRerunning}
            showRerunTrigger={!!(conversation.triggerId && conversation.agentId)}
          />
        </ResizablePanelGroup>
      </div>

      <FeedbackDialog
        isOpen={feedbackDialog.open}
        onOpenChange={(open) => setFeedbackDialog((prev) => ({ ...prev, open }))}
        tenantId={tenantId}
        projectId={projectId}
        conversationId={conversationId}
        messageId={feedbackDialog.messageId}
      />
    </div>
  );
}

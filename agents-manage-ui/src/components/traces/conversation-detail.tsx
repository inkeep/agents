'use client';

import {
  Activity,
  ArrowLeft,
  ExternalLink as ExternalLinkIcon,
  MessageSquare,
  TriangleAlert,
} from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { formatDateTime, formatDuration } from '@/app/utils/format-date';
import type {
  ActivityItem,
  ConversationDetail as ConversationDetailType,
} from '@/components/traces/timeline/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ExternalLink } from '@/components/ui/external-link';
import { ResizablePanelGroup } from '@/components/ui/resizable';
import { Skeleton } from '@/components/ui/skeleton';
import { useRuntimeConfig } from '@/contexts/runtime-config-context';
import { getSignozTracesExplorerUrl } from '@/lib/utils/signoz-links';
import { copyTraceToClipboard } from '@/lib/utils/trace-formatter';
import { SignozLink } from './signoz-link';
import { InfoRow } from './timeline/blocks';
import { TimelineWrapper } from './timeline/timeline-wrapper';

interface ConversationDetailProps {
  conversationId: string;
  onBack?: () => void;
}

export function ConversationDetail({ conversationId, onBack }: ConversationDetailProps) {
  const [conversation, setConversation] = useState<ConversationDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const { tenantId, projectId } = useParams();
  const { PUBLIC_SIGNOZ_URL } = useRuntimeConfig();

  const handleCopyTrace = async () => {
    if (!conversation) return;

    setIsCopying(true);
    try {
      const result = await copyTraceToClipboard(conversation);
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

  useEffect(() => {
    const fetchConversationDetail = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/signoz/conversations/${conversationId}`);
        if (!response.ok) throw new Error('Failed to fetch conversation details');
        const data = await response.json();
        setConversation(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (conversationId) fetchConversationDetail();
  }, [conversationId]);

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
          {onBack && (
            <Button onClick={onBack} variant="outline" className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Overview
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 flex-shrink-0">
        <div className="flex items-center gap-2">
          {onBack && (
            <Button onClick={onBack} variant="ghost" size="icon-sm">
              <ArrowLeft className="h-4 w-4" />
              <span className="sr-only">Back</span>
            </Button>
          )}
          <div className="flex items-center gap-2">
            <h3 className="text-xl font-light">Conversation details</h3>
          </div>
        </div>
        <div className="flex items-center gap-2">
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
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-4 flex-shrink-0">
        {/* Duration */}
        <Card
          className="shadow-none bg-background"
          title={
            conversation.conversationStartTime && conversation.conversationEndTime
              ? `Start: ${conversation.conversationStartTime}\nEnd: ${conversation.conversationEndTime}`
              : 'Timing data not available'
          }
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Duration</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {conversation.conversationStartTime && conversation.conversationEndTime ? (
                <>
                  <div className="text-sm font-medium text-foreground">
                    <div className="flex items-center gap-1">
                      <span className="text-xs text-muted-foreground">Start:</span>
                      <span className="text-xs font-mono">
                        {formatDateTime(conversation.conversationStartTime)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 mt-1">
                      <span className="text-xs text-muted-foreground">End:</span>
                      <span className="text-xs font-mono">
                        {formatDateTime(conversation.conversationEndTime)}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-1 mt-2">
                    {conversation.conversationDuration && (
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

        {/* AI Calls summary grouped by model */}
        <Card className="shadow-none bg-background">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">AI Calls</CardTitle>
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {(() => {
              const ai = conversation?.activities?.filter(
                (a: ActivityItem) =>
                  a.type === 'ai_generation' || a.type === 'ai_model_streamed_text'
              ) as ActivityItem[];
              const models: Record<
                string,
                { inputTokens: number; outputTokens: number; count: number }
              > = {};
              ai.forEach((a: ActivityItem) => {
                const model = a.aiModel || a.aiStreamTextModel || 'Unknown Model';
                models[model] ||= { inputTokens: 0, outputTokens: 0, count: 0 };
                models[model].inputTokens += a.inputTokens || 0;
                models[model].outputTokens += a.outputTokens || 0;
                models[model].count += 1;
              });
              const entries = Object.entries(models);
              return (
                <div className="space-y-3">
                  {entries.length ? (
                    entries.map(([model, data]) => (
                      <div key={model} className="border border-border rounded-lg p-3">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium text-foreground">{model}</span>
                          <span className="text-xs text-muted-foreground">{data.count} calls</span>
                        </div>
                        <div className="space-y-1">
                          <InfoRow
                            label="Total Input Tokens"
                            value={data.inputTokens.toLocaleString()}
                          />
                          <InfoRow
                            label="Total Output Tokens"
                            value={data.outputTokens.toLocaleString()}
                          />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="text-center">
                      <div className="text-2xl font-bold text-muted-foreground mb-1">0</div>
                      <p className="text-xs text-muted-foreground">No AI calls found.</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>

        {/* Alerts */}
        <Card className="shadow-none bg-background">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Alerts</CardTitle>
            <TriangleAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {(() => {
              const errors = conversation.errorCount ?? 0;
              const warnings = conversation.warningCount ?? 0;
              const total = errors + warnings;

              return (
                <>
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
                  ) : (
                    <div>
                      <div className="text-2xl font-bold font-mono text-green-600 mb-1">0</div>
                      <p className="text-xs text-muted-foreground">No warnings or errors</p>
                    </div>
                  )}
                  {total > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full flex items-center justify-center gap-1"
                      onClick={() => {
                        window.open(
                          getSignozTracesExplorerUrl(conversationId as string, PUBLIC_SIGNOZ_URL),
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
            onCopyTrace={handleCopyTrace}
            isCopying={isCopying}
          />
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

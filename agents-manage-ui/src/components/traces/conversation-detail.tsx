'use client';

import { Activity, ArrowLeft, MessageSquare, TriangleAlert } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatDateTime, formatDuration } from '@/app/utils/format-date';
import type {
  ActivityItem,
  ConversationDetail as ConversationDetailType,
} from '@/components/traces/timeline/types';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ResizablePanelGroup } from '@/components/ui/resizable';
import { Skeleton } from '@/components/ui/skeleton';
import { ConversationErrors } from './conversation-errors';
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
  const [showErrorsPage, setShowErrorsPage] = useState(false);

  useEffect(() => {
    const fetchConversationDetail = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(`/api/signoz/conversations/${conversationId}`);
        if (!response.ok) throw new Error('Failed to fetch conversation details');
        const data = await response.json();
        if (typeof data.totalErrors === 'undefined') data.totalErrors = 0;
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
          <Skeleton className="h-10 w-24" />
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
          <p className="text-sm text-muted-foreground">{error || 'Conversation not found'}</p>
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

  if (showErrorsPage) {
    return (
      <ConversationErrors conversationId={conversationId} onBack={() => setShowErrorsPage(false)} />
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
            <h3 className="text-xl font-light">Conversation Details</h3>
            <Badge variant="code" className="text-xs">
              {conversationId}
            </Badge>
            {(conversation.graphId || conversation.graphName) && (
              <Badge variant="code" className="text-xs">
                Graph:{' '}
                {conversation.graphName
                  ? `${conversation.graphName} (${conversation.graphId})`
                  : conversation.graphId}
              </Badge>
            )}
          </div>
        </div>
        <SignozLink conversationId={conversationId} />
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 mb-4 flex-shrink-0">
        {/* Errors */}
        <Card
          className={`shadow-none bg-background ${conversation.totalErrors > 0 ? 'cursor-pointer hover:bg-destructive/5 dark:hover:bg-destructive/10 transition-colors' : ''}`}
          onClick={() => {
            if (conversation.totalErrors > 0) setShowErrorsPage(true);
          }}
        >
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-foreground">Errors</CardTitle>
            <TriangleAlert className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${conversation.totalErrors > 0 ? 'text-red-600' : 'text-green-600'}`}
            >
              {conversation.totalErrors}
            </div>
            <p className="text-xs text-muted-foreground">
              {conversation.totalErrors === 0
                ? 'No errors detected'
                : (() => {
                    const mcp = conversation.mcpToolErrors?.length || 0;
                    const ctx = conversation.contextErrors?.length || 0;
                    const agent = conversation.agentGenerationErrors?.length || 0;
                    if (mcp || ctx || agent) {
                      const parts = [];
                      if (mcp) parts.push(`${mcp} MCP tool`);
                      if (ctx) parts.push(`${ctx} context`);
                      if (agent) parts.push(`${agent} agent generation`);
                      return `${parts.join(', ')} errors - Click to view details`;
                    }
                    return 'Errors in conversation';
                  })()}
            </p>
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
                      <p className="text-xs text-muted-foreground">No AI calls found</p>
                    </div>
                  )}
                </div>
              );
            })()}
          </CardContent>
        </Card>

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
      </div>

      {/* Timeline Panel - Takes remaining height */}
      <div className="flex-1 min-h-0">
        <ResizablePanelGroup
          direction="horizontal"
          className="h-full border rounded-xl bg-background"
        >
          <TimelineWrapper conversation={conversation} />
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

'use client';

import { AlertCircle, ArrowLeft } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface ConversationErrorsProps {
  conversationId: string;
  onBack?: () => void;
}

interface MCPToolError {
  spanId: string;
  toolName: string;
  error: string;
  failureReason: string;
  timestamp: string;
}

interface ConversationDetail {
  conversationId: string;
  totalErrors: number;
  mcpToolErrors?: MCPToolError[];
  contextErrors?: ContextError[];
  agentGenerationErrors?: AgentGenerationError[];
  executionIterationErrors?: ExecutionIterationError[];
}

interface ExecutionIterationError {
  spanId: string;
  error: string;
  timestamp: string;
}

interface ContextError {
  spanId: string;
  timestamp: string;
  statusDescription: string;
}

interface AgentGenerationError {
  spanId: string;
  timestamp: string;
  statusDescription: string;
}

export function ConversationErrors({ conversationId, onBack }: ConversationErrorsProps) {
  const [conversation, setConversation] = useState<ConversationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchConversationDetail = async () => {
      try {
        setLoading(true);
        setError(null);

        const response = await fetch(`/api/signoz/conversations/${conversationId}`);

        if (!response.ok) {
          throw new Error('Failed to fetch conversation details');
        }

        const data = await response.json();
        setConversation(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    if (conversationId) {
      fetchConversationDetail();
    }
  }, [conversationId]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-4 mb-6">
          <Skeleton className="h-10 w-24" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error || !conversation) {
    return (
      <Card className="shadow-none bg-background">
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading Conversation Errors</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{error || 'Conversation not found'}</p>
          {onBack && (
            <Button onClick={onBack} variant="outline" className="mt-4">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Conversation
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <Card className="shadow-none bg-background">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {onBack && (
                <Button onClick={onBack} variant="ghost" size="sm" className="h-8 w-8 p-0">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              )}
              <div>
                <CardTitle className="text-foreground text-lg">Conversation Errors</CardTitle>
                <p className="text-sm text-muted-foreground mt-1">{conversationId}</p>
              </div>
            </div>
            <Badge variant="destructive">{conversation.totalErrors} errors</Badge>
          </div>
        </CardHeader>
      </Card>

      {/* Errors List */}
      <div className="space-y-4">
        {/* MCP Tool Errors */}
        {conversation.mcpToolErrors && conversation.mcpToolErrors.length > 0 && (
          <>
            <h3 className="text-md font-semibold text-foreground mt-6 mb-3">MCP Tool Errors</h3>
            {conversation.mcpToolErrors.map((mcpError) => (
              <Card
                key={`mcp-${mcpError.spanId}`}
                className="shadow-none bg-background border-l-4 border-l-red-500"
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-red-500" />
                      {mcpError.toolName}
                    </CardTitle>
                    <Badge variant="outline" className="font-mono text-xs">
                      {mcpError.spanId}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-sm font-medium text-foreground">Error Message</div>
                    <div className="bg-destructive/10 dark:bg-destructive/20 border border-destructive/20 dark:border-destructive/30 rounded-lg p-3 mt-1">
                      <p className="text-destructive dark:text-destructive text-sm leading-relaxed">
                        {mcpError.error}
                      </p>
                    </div>
                  </div>

                  <div>
                    <div className="text-sm font-medium text-foreground">Failure Reason</div>
                    <div className="bg-orange-100 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-3 mt-1">
                      <p className="text-orange-800 dark:text-orange-400 text-sm leading-relaxed">
                        {mcpError.failureReason}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}

        {/* Context Errors */}
        {conversation.contextErrors && conversation.contextErrors.length > 0 && (
          <>
            <h3 className="text-md font-semibold text-foreground mt-6 mb-3">
              Context Resolution Errors
            </h3>
            {conversation.contextErrors.map((contextError) => (
              <Card
                key={`context-${contextError.spanId}`}
                className="shadow-none bg-background border-l-4 border-l-red-500"
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-red-500" />
                      Context Resolution Failed
                    </CardTitle>
                    <Badge variant="outline" className="font-mono text-xs">
                      {contextError.spanId}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-sm font-medium text-foreground">Error Description</div>
                    <div className="bg-destructive/10 dark:bg-destructive/20 border border-destructive/20 dark:border-destructive/30 rounded-lg p-3 mt-1">
                      <p className="text-destructive dark:text-destructive text-sm leading-relaxed">
                        {contextError.statusDescription}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}

        {/* Agent Generation Errors */}
        {conversation.agentGenerationErrors && conversation.agentGenerationErrors.length > 0 && (
          <>
            <h3 className="text-md font-semibold text-foreground mt-6 mb-3">
              Agent Generation Errors
            </h3>
            {conversation.agentGenerationErrors.map((agentError) => (
              <Card
                key={`agent-${agentError.spanId}`}
                className="shadow-none bg-background border-l-4 border-l-red-500"
              >
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-red-500" />
                      Agent Generation Failed
                    </CardTitle>
                    <Badge variant="outline" className="font-mono text-xs">
                      {agentError.spanId}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <div className="text-sm font-medium text-foreground">Error Description</div>
                    <div className="bg-destructive/10 dark:bg-destructive/20 border border-destructive/20 dark:border-destructive/30 rounded-lg p-3 mt-1">
                      <p className="text-destructive dark:text-destructive text-sm leading-relaxed">
                        {agentError.statusDescription}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </>
        )}

        {/* Execution Iteration Errors */}
        {conversation.executionIterationErrors &&
          conversation.executionIterationErrors.length > 0 && (
            <>
              <h3 className="text-md font-semibold text-foreground mt-6 mb-3">
                Execution Iteration Errors
              </h3>
              {conversation.executionIterationErrors.map((execError) => (
                <Card
                  key={`exec-${execError.spanId}`}
                  className="shadow-none bg-background border-l-4 border-l-red-500"
                >
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg flex items-center gap-2">
                        <AlertCircle className="h-5 w-5 text-red-500" />
                        Maximum Execution Iterations Reached
                      </CardTitle>
                      <Badge variant="outline" className="font-mono text-xs">
                        {execError.spanId}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <div className="text-sm font-medium text-foreground">Error Message</div>
                      <div className="bg-destructive/10 dark:bg-destructive/20 border border-destructive/20 dark:border-destructive/30 rounded-lg p-3 mt-1">
                        <p className="text-destructive dark:text-destructive text-sm leading-relaxed">
                          {execError.error}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </>
          )}

        {/* No Errors Message */}
        {(!conversation.mcpToolErrors || conversation.mcpToolErrors.length === 0) &&
          (!conversation.contextErrors || conversation.contextErrors.length === 0) &&
          (!conversation.agentGenerationErrors ||
            conversation.agentGenerationErrors.length === 0) &&
          (!conversation.executionIterationErrors ||
            conversation.executionIterationErrors.length === 0) && (
            <Card className="shadow-none bg-background">
              <CardContent className="py-8 text-center">
                <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <h3 className="text-lg font-medium text-foreground mb-2">No Errors Found</h3>
                <p className="text-sm text-muted-foreground">
                  No errors found for this conversation.
                </p>
              </CardContent>
            </Card>
          )}
      </div>
    </div>
  );
}

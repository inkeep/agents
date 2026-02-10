'use client';

import { ArrowLeft, ChevronRight, Clock, ExternalLink, Loader2, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { use, useCallback, useEffect, useMemo, useState } from 'react';
import { DatasetItemViewDialog } from '@/components/dataset-items/dataset-item-view-dialog';
import {
  TestCaseFilters,
  type TestCaseFilters as TestCaseFiltersType,
} from '@/components/datasets/test-case-filters';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { DatasetRunWithConversations } from '@/lib/api/dataset-runs';
import { fetchDatasetRun } from '@/lib/api/dataset-runs';
import { fetchEvaluationJobConfigEvaluators } from '@/lib/api/evaluation-job-configs';
import { fetchEvaluationResultsByJobConfig } from '@/lib/api/evaluation-results';
import { formatDateAgo, formatDateTime } from '@/lib/utils/format-date';

export default function Page({
  params,
}: PageProps<'/[tenantId]/projects/[projectId]/datasets/[datasetId]/runs/[runId]'>) {
  const { tenantId, projectId, datasetId, runId } = use(params);
  const [run, setRun] = useState<DatasetRunWithConversations | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [filters, setFilters] = useState<TestCaseFiltersType>({});
  const [evaluationProgress, setEvaluationProgress] = useState<{
    total: number;
    completed: number;
    isRunning: boolean;
  } | null>(null);

  const loadRun = useCallback(
    async (showLoading = true) => {
      try {
        if (showLoading) {
          setLoading(true);
        }
        setError(null);
        const response = await fetchDatasetRun(tenantId, projectId, runId);
        setRun(response.data);

        // If there's an evaluation job, fetch evaluation progress
        if (response.data?.evaluationJobConfigId) {
          const [evaluatorRelations, evalResults] = await Promise.all([
            fetchEvaluationJobConfigEvaluators(
              tenantId,
              projectId,
              response.data.evaluationJobConfigId
            ),
            fetchEvaluationResultsByJobConfig(
              tenantId,
              projectId,
              response.data.evaluationJobConfigId
            ),
          ]);

          // Count conversations that have been created
          const conversationCount =
            response.data.items?.reduce(
              (acc, item) => acc + (item.conversations?.length || 0),
              0
            ) || 0;

          // Expected evaluations = conversations × evaluators
          const evaluatorCount = evaluatorRelations.data?.length || 0;
          const expectedEvaluations = conversationCount * evaluatorCount;
          // Only count evaluations that have output (completed evaluations)
          const completedEvaluations =
            evalResults.data?.filter(
              (result) => result.output !== null && result.output !== undefined
            ).length || 0;

          setEvaluationProgress({
            total: expectedEvaluations,
            completed: completedEvaluations,
            isRunning: completedEvaluations < expectedEvaluations && expectedEvaluations > 0,
          });
        } else {
          setEvaluationProgress(null);
        }
      } catch (err) {
        console.error('Error loading dataset run:', err);
        setError(err instanceof Error ? err.message : 'Failed to load run');
      } finally {
        if (showLoading) {
          setLoading(false);
        }
      }
    },
    [tenantId, projectId, runId]
  );

  // Calculate conversation progress
  const conversationProgress = useMemo(() => {
    if (!run?.items) return { total: 0, completed: 0, isRunning: false };
    const total = run.items.length;
    const completed = run.items.filter(
      (item) => item.conversations && item.conversations.length > 0
    ).length;
    return { total, completed, isRunning: completed < total && total > 0 };
  }, [run]);

  // Overall progress - run is complete only when both conversations AND evaluations are done
  const isRunInProgress =
    conversationProgress.isRunning || (evaluationProgress?.isRunning ?? false);

  // Initial load
  useEffect(() => {
    loadRun();
  }, [loadRun]);

  // Auto-refresh when run is in progress
  useEffect(() => {
    if (!isRunInProgress) return;

    const interval = setInterval(() => {
      loadRun(false); // Don't show loading state for refresh
    }, 3000); // Refresh every 3 seconds

    return () => clearInterval(interval);
  }, [isRunInProgress, loadRun]);

  const uniqueAgents = useMemo(() => {
    if (!run?.items) return [];
    const agentIds = new Set<string>();
    run.items.forEach((item) => {
      item.conversations?.forEach((conv) => {
        if (conv.agentId) {
          agentIds.add(conv.agentId);
        }
      });
    });
    return Array.from(agentIds).map((id) => ({ id, name: id }));
  }, [run]);

  const filteredItems = useMemo(() => {
    if (!run?.items) return [];

    return run.items
      .map((item) => {
        const getInputText = (): string => {
          const input = item.input;
          if (!input) return '';

          if (typeof input === 'object' && 'messages' in input) {
            const messages = input.messages;
            if (Array.isArray(messages) && messages.length > 0) {
              const firstMessage = messages[0];
              if (firstMessage?.content) {
                const content = firstMessage.content;
                if (typeof content === 'string') {
                  return content;
                }
                if (typeof content === 'object' && content !== null && 'text' in content) {
                  const text = (content as { text?: unknown }).text;
                  if (typeof text === 'string') {
                    return text;
                  }
                }
              }
            }
          }

          return '';
        };

        const inputText = getInputText().toLowerCase();

        if (filters.searchInput && !inputText.includes(filters.searchInput.toLowerCase())) {
          return null;
        }

        let conversations = item.conversations || [];

        if (filters.agentId) {
          conversations = conversations.filter((conv) => conv.agentId === filters.agentId);
        }

        if (filters.outputStatus && filters.outputStatus !== 'all') {
          if (filters.outputStatus === 'has_output') {
            conversations = conversations.filter((conv) => conv.output);
          } else if (filters.outputStatus === 'no_output') {
            conversations = conversations.filter((conv) => !conv.output);
          }
        }

        if (conversations.length === 0 && (filters.agentId || filters.outputStatus)) {
          return null;
        }

        return {
          ...item,
          conversations,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [run, filters]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-48" />
        <Card>
          <CardHeader>
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-4 w-24 mt-2" />
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (error || !run) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error</CardTitle>
          <CardDescription>{error || 'Run not found'}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/${tenantId}/projects/${projectId}/datasets/${datasetId}?tab=runs`}>
          <Button variant="ghost" size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to test suite
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{run.runConfigName || `Run ${run.id.slice(0, 8)}`}</CardTitle>
          <CardDescription className="flex items-center gap-2 mt-1">
            <Clock className="h-3 w-3" />
            Created {formatDateAgo(run.createdAt)}
          </CardDescription>
          {isRunInProgress && (
            <div className="mt-4 flex flex-col gap-3 p-3 rounded-lg bg-muted/50 border">
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                <span className="text-sm font-medium">Run in progress</span>
              </div>

              {/* Conversation progress */}
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">
                  Test cases: {conversationProgress.completed} of {conversationProgress.total}{' '}
                  completed
                  {!conversationProgress.isRunning && conversationProgress.total > 0 && (
                    <span className="ml-2 text-green-600 dark:text-green-400">✓</span>
                  )}
                </span>
                <Progress
                  value={conversationProgress.completed}
                  max={conversationProgress.total}
                  className="h-1.5"
                />
              </div>

              {/* Evaluation progress (if evaluators are attached) */}
              {evaluationProgress && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted-foreground">
                    Evaluations: {evaluationProgress.completed} of {evaluationProgress.total}{' '}
                    completed
                    {!evaluationProgress.isRunning && evaluationProgress.total > 0 && (
                      <span className="ml-2 text-green-600 dark:text-green-400">✓</span>
                    )}
                  </span>
                  <Progress
                    value={evaluationProgress.completed}
                    max={evaluationProgress.total}
                    className="h-1.5"
                  />
                </div>
              )}
            </div>
          )}
          {!isRunInProgress && conversationProgress.total > 0 && (
            <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <span className="text-green-600 dark:text-green-400">✓</span>
              Run completed: {conversationProgress.completed} test cases
              {evaluationProgress && `, ${evaluationProgress.completed} evaluations`}
            </div>
          )}
          {run.evaluationJobConfigId && (
            <div className="mt-4">
              <Link
                href={`/${tenantId}/projects/${projectId}/evaluations/jobs/${run.evaluationJobConfigId}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Button variant="outline" size="sm" className="w-full sm:w-auto">
                  <Sparkles className="mr-2 h-4 w-4" />
                  View Evaluation Job
                  <ExternalLink className="ml-2 h-3 w-3" />
                </Button>
              </Link>
            </div>
          )}
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>
            Test Cases (
            {filteredItems.reduce((acc, item) => acc + (item.conversations?.length || 0), 0)}{' '}
            {filteredItems.length !== (run.items?.length || 0) && (
              <span className="text-muted-foreground">
                of{' '}
                {run.items?.reduce((acc, item) => acc + (item.conversations?.length || 0), 0) || 0}
              </span>
            )}
            )
          </CardTitle>
          <CardDescription>Test cases executed in this test suite run</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <TestCaseFilters filters={filters} onFiltersChange={setFilters} agents={uniqueAgents} />
          {!run.items || run.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">No items found</p>
          ) : filteredItems.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              No test cases match the current filters.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Input</TableHead>
                  <TableHead>Agent</TableHead>
                  <TableHead>Output</TableHead>
                  <TableHead>Run At</TableHead>
                  <TableHead>Conversation ID</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredItems.flatMap((item) => {
                  // Extract input text from the item
                  const getInputPreview = (): string => {
                    const input = item.input;
                    if (!input) return 'No input';

                    // Handle object input with messages
                    if (typeof input === 'object' && 'messages' in input) {
                      const messages = input.messages;
                      if (Array.isArray(messages) && messages.length > 0) {
                        const firstMessage = messages[0];
                        if (firstMessage?.content) {
                          const content = firstMessage.content;
                          if (typeof content === 'string') {
                            return content.length > 100 ? `${content.slice(0, 100)}...` : content;
                          }
                          if (
                            typeof content === 'object' &&
                            content !== null &&
                            'text' in content
                          ) {
                            const text = (content as { text?: unknown }).text;
                            if (typeof text === 'string') {
                              return text.length > 100 ? `${text.slice(0, 100)}...` : text;
                            }
                            return String(text || 'No input');
                          }
                        }
                      }
                    }

                    return 'No input';
                  };

                  const inputPreview = getInputPreview();

                  // Show all conversations for this item (one row per agent run)
                  const conversations = item.conversations || [];
                  if (conversations.length === 0) {
                    // No conversations yet - show placeholder row with loading state if run is in progress
                    return (
                      <TableRow key={item.id}>
                        <TableCell>
                          <button
                            type="button"
                            onClick={() => setSelectedItemId(item.id)}
                            className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline text-left max-w-md truncate"
                          >
                            <span className="truncate">{inputPreview}</span>
                            <ChevronRight className="h-4 w-4 flex-shrink-0" />
                          </button>
                        </TableCell>
                        <TableCell>
                          <span className="text-sm text-muted-foreground">-</span>
                        </TableCell>
                        <TableCell>
                          {conversationProgress.isRunning ? (
                            <span className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="h-3 w-3 animate-spin" />
                              Processing...
                            </span>
                          ) : (
                            <span className="text-sm text-muted-foreground">No output</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <span className="text-sm">
                            {formatDateTime(run.createdAt, { local: true })}
                          </span>
                        </TableCell>
                        <TableCell>
                          {conversationProgress.isRunning ? (
                            <span className="text-sm text-muted-foreground">Pending...</span>
                          ) : (
                            <span className="text-sm text-muted-foreground">No conversation</span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  }

                  return conversations.map((conversation) => (
                    <TableRow key={`${item.id}-${conversation.conversationId}`}>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => setSelectedItemId(item.id)}
                          className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline text-left max-w-md truncate"
                        >
                          <span className="truncate">{inputPreview}</span>
                          <ChevronRight className="h-4 w-4 flex-shrink-0" />
                        </button>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs font-mono text-muted-foreground">
                          {conversation.agentId || '-'}
                        </code>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm text-muted-foreground max-w-md truncate block">
                          {conversation.output
                            ? conversation.output.length > 100
                              ? `${conversation.output.slice(0, 100)}...`
                              : conversation.output
                            : 'No output'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <span className="text-sm">
                          {formatDateTime(conversation.createdAt, { local: true })}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/${tenantId}/projects/${projectId}/traces/conversations/${conversation.conversationId}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                        >
                          <code className="font-mono">{conversation.conversationId}</code>
                          <ExternalLink className="h-4 w-4" />
                        </Link>
                      </TableCell>
                    </TableRow>
                  ));
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {selectedItemId &&
        run.items &&
        (() => {
          const selectedItem = run.items.find((item) => item.id === selectedItemId);
          if (!selectedItem) return null;
          return (
            <DatasetItemViewDialog
              item={selectedItem}
              isOpen={selectedItemId !== null}
              onOpenChange={(open) => !open && setSelectedItemId(null)}
            />
          );
        })()}
    </div>
  );
}

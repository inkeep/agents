'use client';

import { AlertCircle, ChevronDown, ChevronRight, Lightbulb, X } from 'lucide-react';
import { type ComponentProps, useEffect, useState } from 'react';
import { useGroupedAgentErrors } from '@/components/agent/use-grouped-agent-errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { firstNestedMessage } from '@/components/ui/form';
import { useSidePane } from '@/hooks/use-side-pane';

interface AgentErrorSummaryProps {
  onNavigateToNode?: (nodeId: string) => void;
  onNavigateToEdge?: (edgeId: string) => void;
}

interface PartialProcessedAgentError {
  nodeId?: string;
  edgeId?: string;
  field: string;
  message?: string;
}

interface ErrorGroupProps {
  title: string;
  errors: PartialProcessedAgentError[];
  onNavigate?: (id: string) => void;
}

function ErrorGroup({ title, errors, onNavigate }: ErrorGroupProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (errors.length === 0) return null;

  const groupedErrors: Record<string, PartialProcessedAgentError[]> = {};
  for (const error of errors) {
    const key = error.nodeId || error.edgeId || 'general';
    groupedErrors[key] ??= [];
    groupedErrors[key].push(error);
  }
  const IconToUse = isOpen ? ChevronDown : ChevronRight;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="p-1.5 h-auto text-red-600 dark:text-red-400 text-xs">
          <IconToUse />
          {`${title} Errors (${errors.length})`}
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pl-4 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-red-200 dark:scrollbar-thumb-red-800 scrollbar-track-transparent hover:scrollbar-thumb-red-300 dark:hover:scrollbar-thumb-red-700">
        {Object.entries(groupedErrors).map(([itemId, itemErrors]) => (
          <div key={itemId} className="space-y-1">
            <div className="flex items-center gap-1.5">
              {itemErrors[0].nodeId && (
                <span className="text-xs font-medium text-foreground truncate">
                  {`${title} (${itemErrors[0].nodeId})`}
                </span>
              )}
              {onNavigate && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onNavigate(itemId)}
                  className="h-5 px-1.5 text-xs normal-case"
                >
                  Go to
                </Button>
              )}
            </div>
            <div className="space-y-2">
              {itemErrors.map((error, index) => (
                <div
                  key={`${itemId}-${index}`}
                  className="text-xs text-red-700 dark:text-red-300 bg-red-50/90 dark:bg-red-950/40 p-2 rounded border border-red-200 dark:border-red-700"
                >
                  <b>{error.field}</b>: {error.message}
                </div>
              ))}
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function processMessagesWithNodeId(obj: Record<string, undefined | Record<string, unknown>>) {
  return Object.entries(obj).flatMap(([nodeId, groupValue = {}]) => {
    // edge case when groupValue doesn't contain field names, e.g.
    // y74w91v3v5fxxfy9yb2gm: {message: 'Unrecognized keys: "id", "functionId"', type: 'unrecognized_keys', ref: undefined}
    if (groupValue.message && groupValue.type && 'ref' in groupValue) {
      return {
        nodeId,
        field: 'global',
        message: firstNestedMessage(groupValue),
      };
    }

    return Object.entries(groupValue).map(([field, value]) => ({
      nodeId,
      field,
      message: firstNestedMessage(value),
    }));
  });
}

export function useWindowFocus(): boolean {
  const [isFocused, setIsFocused] = useState(false);

  useEffect(() => {
    const editableFocusSelector = [
      //
      'input:not([type="hidden"])',
      'textarea',
      'select',
    ].join();
    function handler(_event: FocusEvent) {
      const el = document.activeElement;

      setIsFocused(el?.matches(editableFocusSelector) ?? false);
    }

    window.addEventListener('focusin', handler);
    window.addEventListener('focusout', handler);

    return () => {
      window.removeEventListener('focusin', handler);
      window.removeEventListener('focusout', handler);
    };
  }, []);

  return isFocused;
}

export function AgentErrorSummary({ onNavigateToNode }: AgentErrorSummaryProps) {
  'use memo';
  const { setQueryState } = useSidePane();

  function handleNavigateToNode(nodeId: string) {
    setQueryState({ pane: 'node', nodeId, edgeId: null });
    onNavigateToNode?.(nodeId);
  }

  // const handleNavigateToEdge = (edgeId: string) => {
  //   setQueryState({
  //     pane: 'edge',
  //     nodeId: null,
  //     edgeId,
  //   });
  //   onNavigateToEdge?.(edgeId);
  // };
  // const getConnectionLabel = (error: ProcessedAgentError) => {
  //   return `Connection (${error.edgeId})`;
  // };
  // const edgeErrors = Object.values(errorSummary.edgeErrors).flat();
  const { subAgents, functionTools, externalAgents, teamAgents, tools, agentSettings, other } =
    useGroupedAgentErrors();

  const [showErrors, setShowErrors] = useState(true);
  const data: ComponentProps<typeof ErrorGroup>[] = [
    {
      title: 'Sub Agent',
      errors: processMessagesWithNodeId(subAgents),
      onNavigate: handleNavigateToNode,
    },
    {
      title: 'Function Tool',
      errors: processMessagesWithNodeId(functionTools),
      onNavigate: handleNavigateToNode,
    },
    {
      title: 'External Agent',
      errors: processMessagesWithNodeId(externalAgents),
      onNavigate: handleNavigateToNode,
    },
    {
      title: 'Team Agent',
      errors: processMessagesWithNodeId(teamAgents),
      onNavigate: handleNavigateToNode,
    },
    {
      title: 'MCP Tool',
      errors: processMessagesWithNodeId(tools),
      onNavigate: handleNavigateToNode,
    },
    {
      title: 'Agent Settings',
      errors: processMessagesWithNodeId({ '': agentSettings }),
      onNavigate() {
        setQueryState({ pane: 'agent', nodeId: null, edgeId: null });
      },
    },
    {
      title: 'Other',
      errors: processMessagesWithNodeId({ '': other }),
    },
  ];

  const errorCount = data.reduce((acc, curr) => acc + curr.errors.length, 0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset showErrors state when errors were changed
  useEffect(() => {
    setShowErrors(true);
  }, [errorCount]);

  const isFocused = useWindowFocus();

  if (!errorCount || !showErrors || isFocused) {
    return;
  }

  return (
    <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30 backdrop-blur-sm shadow-xl gap-2 py-4 max-h-[80vh] animate-in slide-in-from-bottom-2 duration-300">
      <CardHeader className="px-3">
        <CardTitle className="flex items-center justify-between text-red-700 dark:text-red-400 text-sm">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="size-3" />
            {`Validation Errors (${errorCount})`}
          </div>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => {
              setShowErrors((prev) => !prev);
            }}
          >
            <X className="size-3" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-3 overflow-y-auto max-h-[calc(80vh-80px)] scrollbar-thin scrollbar-thumb-red-200 dark:scrollbar-thumb-red-800 scrollbar-track-transparent hover:scrollbar-thumb-red-300 dark:hover:scrollbar-thumb-red-700">
        <div className="text-xs text-red-600 dark:text-red-400 ml-4 mb-2">
          Fix these issues to save your agent:
        </div>

        {data.map((o) => (
          <ErrorGroup key={o.title} {...o} />
        ))}

        {/*<ErrorGroup*/}
        {/*  title="Connection Errors"*/}
        {/*  errors={edgeErrors}*/}
        {/*  icon={<div className="w-3 h-3 border rounded-full" />}*/}
        {/*  onNavigate={handleNavigateToEdge}*/}
        {/*  getItemLabel={getConnectionLabel}*/}
        {/*/>*/}

        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-red-200 dark:border-red-800 text-xs text-red-500 dark:text-red-400">
          <Lightbulb className="inline size-3" />
          Click "Go to" buttons to navigate to issues
        </div>
      </CardContent>
    </Card>
  );
}

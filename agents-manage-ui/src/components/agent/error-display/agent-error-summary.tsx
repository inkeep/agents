'use client';

import { AlertCircle, ChevronDown, ChevronRight, Code, X, Zap } from 'lucide-react';
import { type ComponentProps, type ReactNode, useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { firstNestedMessage } from '@/components/ui/form';
import { useFullAgentFormContext } from '@/contexts/full-agent-form';
import { useSidePane } from '@/hooks/use-side-pane';
import type { ProcessedAgentError } from '@/lib/utils/agent-error-parser';

interface AgentErrorSummaryProps {
  onNavigateToNode?: (nodeId: string) => void;
  onNavigateToEdge?: (edgeId: string) => void;
}

interface ErrorGroupProps {
  title: string;
  errors: ProcessedAgentError[];
  icon: ReactNode;
  onNavigate?: (id: string) => void;
  getItemLabel?: (error: ProcessedAgentError) => string;
}

function ErrorGroup({ title, errors, icon, onNavigate, getItemLabel }: ErrorGroupProps) {
  const [isOpen, setIsOpen] = useState(true);

  if (errors.length === 0) return null;

  const groupedErrors: Record<string, ProcessedAgentError[]> = {};
  for (const error of errors) {
    const key = error.nodeId || error.edgeId || 'general';
    if (!groupedErrors[key]) groupedErrors[key] = [];
    groupedErrors[key].push(error);
  }
  const IconToUse = isOpen ? ChevronDown : ChevronRight;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" className="p-1.5 h-auto text-red-600 dark:text-red-400 text-xs">
          {icon}
          {`${title} (${errors.length})`}
          <IconToUse />
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent className="space-y-3 pl-4 max-h-48 overflow-y-auto scrollbar-thin scrollbar-thumb-red-200 dark:scrollbar-thumb-red-800 scrollbar-track-transparent hover:scrollbar-thumb-red-300 dark:hover:scrollbar-thumb-red-700">
        {Object.entries(groupedErrors).map(([itemId, itemErrors]) => (
          <div key={itemId} className="space-y-1">
            <div className="flex items-center gap-1.5">
              {getItemLabel && (
                <span className="text-xs font-medium text-foreground truncate">
                  {getItemLabel(itemErrors[0])}
                </span>
              )}
              {onNavigate && itemId !== 'general' && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => onNavigate(itemId)}
                  className="h-5 px-1.5 text-xs"
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
                  <div className="font-medium mb-1">{error.field}:</div>
                  <div className="text-xs leading-relaxed">{error.message}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </CollapsibleContent>
    </Collapsible>
  );
}

function processMessagesWithNodeId(obj: Record<string, Record<string, unknown>>) {
  return Object.entries(obj).flatMap(([key, value]) => {
    return Object.entries(value).map(([k, v]) => ({
      nodeId: key,
      field: k,
      message: firstNestedMessage(v),
    }));
  });
}

function getErrors() {
  const { control } = useFullAgentFormContext();
  const { errors } = useFormState({ control });

  return {
    errorCount: Object.keys(errors).length,
    errors,
  };
}

export function AgentErrorSummary({ onNavigateToNode, onNavigateToEdge }: AgentErrorSummaryProps) {
  'use memo';
  const { setQueryState } = useSidePane();

  const handleNavigateToNode = (nodeId: string) => {
    setQueryState({
      pane: 'node',
      nodeId,
      edgeId: null,
    });
    onNavigateToNode?.(nodeId);
  };

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

  const { errorCount, errors } = getErrors();
  const {
    subAgents = {},
    functionTools = {},
    externalAgents = {},
    teamAgents = {},
    tools = {},
    ...rest
  } = errors;

  const subAgentErrors = processMessagesWithNodeId(subAgents);
  const functionToolErrors = processMessagesWithNodeId(functionTools);
  const externalAgentsErrors = processMessagesWithNodeId(externalAgents);
  const teamAgentsErrors = processMessagesWithNodeId(teamAgents);
  const toolsErrors = processMessagesWithNodeId(tools);
  // const edgeErrors = Object.values(errorSummary.edgeErrors).flat();
  const agentErrors = Object.entries(rest).map(([key, value]) => ({
    field: key,
    message: firstNestedMessage(value),
  }));
  const [showErrors, setShowErrors] = useState(true);
  const previousErrorSignatureRef = useRef('');
  const errorSignature = [
    ...subAgentErrors.map((error) => `1:${error.field}:${error.message}`),
    ...functionToolErrors.map((error) => `2:${error.field}:${error.message}`),
    ...externalAgentsErrors.map((error) => `3:${error.field}:${error.message}`),
    ...teamAgentsErrors.map((error) => `4:${error.field}:${error.message}`),
    ...toolsErrors.map((error) => `5:${error.field}:${error.message}`),
    ...agentErrors.map((error) => `6:${error.field}:${error.message}`),
  ]
    .sort()
    .join('|');

  useEffect(() => {
    if (!errorCount) {
      previousErrorSignatureRef.current = '';
      return;
    }
    if (previousErrorSignatureRef.current !== errorSignature) {
      setShowErrors(true);
    }

    previousErrorSignatureRef.current = errorSignature;
  }, [errorCount, errorSignature]);

  if (!errorCount || !showErrors) {
    return;
  }

  const data: ComponentProps<typeof ErrorGroup>[] = [
    {
      title: 'Sub Agent Errors',
      errors: subAgentErrors,
      icon: <Zap className="w-3 h-3" />,
      onNavigate: handleNavigateToNode,
      getItemLabel: (error) => `Agent (${error.nodeId})`,
    },
    {
      title: 'Function Tool Errors',
      errors: functionToolErrors,
      icon: <Code className="w-3 h-3" />,
      onNavigate: handleNavigateToNode,
      getItemLabel: (error) => `Function Tool (${error.nodeId})`,
    },
    {
      title: 'External Agent Errors',
      errors: externalAgentsErrors,
      onNavigate: handleNavigateToNode,
      getItemLabel: (error) => `External Agent (${error.nodeId})`,
    },
    {
      title: 'Team Agent Errors',
      errors: teamAgentsErrors,
      onNavigate: handleNavigateToNode,
      getItemLabel: (error) => `Team Agent (${error.nodeId})`,
    },
    {
      title: 'MCP Tool Errors',
      errors: toolsErrors,
      onNavigate: handleNavigateToNode,
      getItemLabel: (error) => `MCP Tool (${error.nodeId})`,
    },
    {
      title: 'Agent Configuration Errors',
      errors: agentErrors,
    },
  ];
  return (
    <Card className="border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-950/30 backdrop-blur-sm shadow-xl gap-2 py-4 max-h-[80vh] animate-in slide-in-from-bottom-2 duration-300">
      <CardHeader className="px-3">
        <CardTitle className="flex items-center justify-between text-red-700 dark:text-red-400 text-sm">
          <div className="flex items-center gap-1.5">
            <AlertCircle className="w-4 h-4" />
            {`Validation Errors (${errorCount})`}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setShowErrors((prev) => !prev);
            }}
            className="h-6 w-6 p-0"
          >
            <X className="w-3 h-3" />
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 px-3 overflow-y-auto max-h-[calc(80vh-80px)] scrollbar-thin scrollbar-thumb-red-200 dark:scrollbar-thumb-red-800 scrollbar-track-transparent hover:scrollbar-thumb-red-300 dark:hover:scrollbar-thumb-red-700">
        <div className="text-xs text-red-600 dark:text-red-400 mb-2">
          Fix these issues to save your agent:
        </div>

        {data.map((o) => (
          <ErrorGroup key={o.title} {...o} icon={o.icon ?? <AlertCircle className="w-3 h-3" />} />
        ))}

        {/*<ErrorGroup*/}
        {/*  title="Connection Errors"*/}
        {/*  errors={edgeErrors}*/}
        {/*  icon={<div className="w-3 h-3 border rounded-full" />}*/}
        {/*  onNavigate={handleNavigateToEdge}*/}
        {/*  getItemLabel={getConnectionLabel}*/}
        {/*/>*/}

        <div className="mt-2 pt-2 border-t border-red-200 dark:border-red-800">
          <div className="text-xs text-red-500 dark:text-red-400">
            💡 Click "Go to" buttons to navigate to issues
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
